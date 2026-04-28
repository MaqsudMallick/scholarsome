import { Injectable } from "@nestjs/common";
import * as crypto from "crypto";
import { Filter } from "mongodb";
import { Folder, UserBasic } from "@scholarsome/shared";
import { Request as ExpressRequest } from "express";
import { AuthService } from "../auth/auth.service";
import { UsersService } from "../users/users.service";
import { FolderDoc, MongoService, SetDoc, UserDoc } from "../providers/database/mongo.service";

export interface FolderUniqueWhere {
  id?: string;
}

export interface FolderCreateData {
  id?: string;
  name: string;
  description?: string | null;
  color: string;
  private: boolean;
  authorId: string;
  parentFolderId?: string | null;
  setIds?: string[];
  subfolderIds?: string[];
}

export interface FolderUpdateData {
  name?: string;
  description?: string | null;
  color?: string;
  private?: boolean;
  parentFolderId?: string | null;
  setIds?: string[];
  subfolderIds?: string[];
}

function authorBasic(doc: UserDoc): UserBasic {
  return {
    id: doc._id,
    username: doc.username,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

function setDocToShallowSet(doc: SetDoc) {
  return {
    id: doc._id,
    authorId: doc.authorId,
    title: doc.title,
    description: doc.description,
    private: doc.private,
    folderIds: doc.folderIds,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    author: undefined as never,
    cards: [],
    folders: []
  };
}

function folderDocToShallowFolder(doc: FolderDoc) {
  return {
    id: doc._id,
    parentFolderId: doc.parentFolderId,
    authorId: doc.authorId,
    name: doc.name,
    description: doc.description,
    color: doc.color,
    private: doc.private,
    setIds: doc.setIds,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    author: undefined as never,
    sets: [],
    subfolders: []
  };
}

function uniqueFilter(where: FolderUniqueWhere): Filter<FolderDoc> {
  if (where.id) return { _id: where.id };
  throw new Error("FolderUniqueWhere requires id");
}

@Injectable()
export class FoldersService {
  constructor(
    private readonly mongo: MongoService,
    private readonly authService: AuthService,
    private readonly usersService: UsersService
  ) {}

  public async verifyFolderOwnership(req: ExpressRequest, folderId: string): Promise<boolean> {
    const userCookie = await this.authService.getUserInfo(req);
    if (!userCookie) return false;

    const user = await this.usersService.user({ id: userCookie.id });
    const folder = await this.folder({ id: folderId });

    if (!folder || !user) return false;
    return folder.author.id === user.id;
  }

  async getSitemapFolderInfo(): Promise<{ id: string, updatedAt: Date }[]> {
    const docs = await this.mongo.folders
        .find({ private: false }, { projection: { _id: 1, updatedAt: 1 } })
        .toArray();
    return docs.map((d) => ({ id: d._id, updatedAt: d.updatedAt }));
  }

  async folder(where: FolderUniqueWhere): Promise<Folder | null> {
    const doc = await this.mongo.folders.findOne(uniqueFilter(where));
    if (!doc) return null;
    return this.populateFolder(doc);
  }

  async folders(params: { where?: { authorId?: string } } = {}): Promise<Folder[]> {
    const filter: Filter<FolderDoc> = {};
    if (params.where?.authorId) filter.authorId = params.where.authorId;

    const docs = await this.mongo.folders.find(filter).toArray();
    return Promise.all(docs.map((d) => this.populateFolder(d)));
  }

  async createFolder(data: FolderCreateData): Promise<Folder> {
    const now = new Date();
    const doc: FolderDoc = {
      _id: data.id ?? crypto.randomUUID(),
      parentFolderId: data.parentFolderId ?? null,
      authorId: data.authorId,
      name: data.name,
      description: data.description ?? null,
      color: data.color,
      private: data.private,
      setIds: data.setIds ?? [],
      createdAt: now,
      updatedAt: now
    };
    await this.mongo.folders.insertOne(doc);

    if (doc.setIds.length > 0) {
      await this.mongo.sets.updateMany(
          { _id: { $in: doc.setIds } },
          { $addToSet: { folderIds: doc._id } }
      );
    }

    if (data.subfolderIds && data.subfolderIds.length > 0) {
      await this.mongo.folders.updateMany(
          { _id: { $in: data.subfolderIds } },
          { $set: { parentFolderId: doc._id, updatedAt: new Date() } }
      );
    }

    return this.populateFolder(doc);
  }

  async updateFolder(params: {
    where: FolderUniqueWhere;
    data: FolderUpdateData;
  }): Promise<Folder> {
    const filter = uniqueFilter(params.where);
    const current = await this.mongo.folders.findOne(filter);
    if (!current) throw new Error("Folder not found");

    const update: Partial<FolderDoc> = { updatedAt: new Date() };
    if (params.data.name !== undefined) update.name = params.data.name;
    if (params.data.description !== undefined) update.description = params.data.description;
    if (params.data.color !== undefined) update.color = params.data.color;
    if (params.data.private !== undefined) update.private = params.data.private;
    if (params.data.parentFolderId !== undefined) update.parentFolderId = params.data.parentFolderId;
    if (params.data.setIds !== undefined) update.setIds = params.data.setIds;

    await this.mongo.folders.updateOne(filter, { $set: update });

    if (params.data.subfolderIds !== undefined) {
      const newSubfolderIds = params.data.subfolderIds;
      const currentSubfolders = await this.mongo.folders
          .find({ parentFolderId: current._id }, { projection: { _id: 1 } })
          .toArray();
      const currentSubfolderIds = currentSubfolders.map((f) => f._id);
      const detached = currentSubfolderIds.filter((id) => !newSubfolderIds.includes(id));

      if (detached.length > 0) {
        await this.mongo.folders.updateMany(
            { _id: { $in: detached } },
            { $set: { parentFolderId: null, updatedAt: new Date() } }
        );
      }
      if (newSubfolderIds.length > 0) {
        await this.mongo.folders.updateMany(
            { _id: { $in: newSubfolderIds } },
            { $set: { parentFolderId: current._id, updatedAt: new Date() } }
        );
      }
    }

    // Synchronize Set.folderIds membership with the new setIds list.
    if (params.data.setIds !== undefined) {
      const oldSetIds = current.setIds;
      const newSetIds = params.data.setIds;
      const added = newSetIds.filter((id) => !oldSetIds.includes(id));
      const removed = oldSetIds.filter((id) => !newSetIds.includes(id));

      if (added.length > 0) {
        await this.mongo.sets.updateMany(
            { _id: { $in: added } },
            { $addToSet: { folderIds: current._id } }
        );
      }
      if (removed.length > 0) {
        await this.mongo.sets.updateMany(
            { _id: { $in: removed } },
            { $pull: { folderIds: current._id } }
        );
      }
    }

    const updated = await this.mongo.folders.findOne(filter);
    if (!updated) throw new Error("Folder not found after update");
    return this.populateFolder(updated);
  }

  async deleteFolder(where: FolderUniqueWhere): Promise<Folder> {
    const filter = uniqueFilter(where);
    const folder = await this.folder(where);
    if (!folder) throw new Error("Folder not found");

    // Detach subfolders from this parent.
    await this.mongo.folders.updateMany(
        { parentFolderId: folder.id },
        { $set: { parentFolderId: null, updatedAt: new Date() } }
    );

    // Remove this folder id from any sets that referenced it.
    await this.mongo.sets.updateMany(
        { folderIds: folder.id },
        { $pull: { folderIds: folder.id } }
    );

    await this.mongo.folders.deleteOne(filter);
    return folder;
  }

  private async populateFolder(doc: FolderDoc): Promise<Folder> {
    const [author, sets, subfolders] = await Promise.all([
      this.mongo.users.findOne({ _id: doc.authorId }),
      doc.setIds.length > 0
        ? this.mongo.sets.find({ _id: { $in: doc.setIds } }).toArray()
        : Promise.resolve([] as SetDoc[]),
      this.mongo.folders.find({ parentFolderId: doc._id }).toArray()
    ]);

    return {
      id: doc._id,
      parentFolderId: doc.parentFolderId,
      authorId: doc.authorId,
      name: doc.name,
      description: doc.description,
      color: doc.color,
      private: doc.private,
      setIds: doc.setIds,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      author: author ? authorBasic(author) : undefined as never,
      sets: sets.map(setDocToShallowSet),
      subfolders: subfolders.map(folderDocToShallowFolder)
    };
  }
}
