import { Injectable } from "@nestjs/common";
import * as crypto from "crypto";
import { Filter } from "mongodb";
import { Set, UserBasic, Card, CardMedia, Folder } from "@scholarsome/shared";
import { Request as ExpressRequest } from "express";
import jwt_decode from "jwt-decode";
import { UsersService } from "../users/users.service";
import { StorageService } from "../providers/storage/storage.service";
import { CardDoc, CardMediaDoc, FolderDoc, MongoService, SetDoc, UserDoc } from "../providers/database/mongo.service";

export interface SetUniqueWhere {
  id?: string;
}

export interface SetCreateData {
  id?: string;
  authorId: string;
  title: string;
  description?: string | null;
  private: boolean;
  folderIds?: string[];
}

export interface SetUpdateData {
  title?: string;
  description?: string | null;
  private?: boolean;
  folderIds?: string[];
}

function authorBasic(doc: UserDoc | null): UserBasic | (never) {
  if (!doc) return undefined as never;
  return {
    id: doc._id,
    username: doc.username,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

function cardDocToCard(doc: CardDoc, mediaDocs: CardMediaDoc[]): Card {
  return {
    id: doc._id,
    setId: doc.setId,
    index: doc.index,
    term: doc.term,
    definition: doc.definition,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    set: undefined as never,
    media: mediaDocs.map<CardMedia>((m) => ({
      id: m._id,
      cardId: m.cardId,
      name: m.name,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      card: undefined as never
    }))
  };
}

function folderDocToShallowFolder(doc: FolderDoc): Folder {
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

function uniqueFilter(where: SetUniqueWhere): Filter<SetDoc> {
  if (where.id) return { _id: where.id };
  throw new Error("SetUniqueWhere requires id");
}

@Injectable()
export class SetsService {
  constructor(
    private readonly mongo: MongoService,
    private readonly usersService: UsersService,
    private readonly storageService: StorageService
  ) {}

  async deleteSetMediaFiles(setId: string): Promise<void> {
    return await this.storageService.getInstance().deleteDirectoryFiles("media/sets/" + setId);
  }

  public async verifySetOwnership(req: ExpressRequest, setId: string): Promise<boolean> {
    let accessToken: { id: string; email: string; };

    if (req.cookies && req.cookies["access_token"]) {
      accessToken = jwt_decode(req.cookies["access_token"]) as { id: string; email: string; };
    } else {
      return false;
    }

    const user = await this.usersService.user({ id: accessToken.id });
    const set = await this.set({ id: setId });

    if (!set || !user) return false;
    return set.author.id === user.id;
  }

  public async shiftCardIndices(
      setId: string,
      startIndex: number,
      shiftAmount: number
  ): Promise<void> {
    await this.mongo.cards.updateMany(
        { setId, index: { $gte: startIndex } },
        { $inc: { index: shiftAmount }, $set: { updatedAt: new Date() } }
    );
  }

  async getSitemapSetInfo(): Promise<{ id: string, updatedAt: Date }[]> {
    const docs = await this.mongo.sets
        .find({ private: false }, { projection: { _id: 1, updatedAt: 1 } })
        .toArray();
    return docs.map((d) => ({ id: d._id, updatedAt: d.updatedAt }));
  }

  async set(where: SetUniqueWhere): Promise<Set | null> {
    const doc = await this.mongo.sets.findOne(uniqueFilter(where));
    if (!doc) return null;
    return this.populateSet(doc);
  }

  async sets(params: { where?: { authorId?: string } } = {}): Promise<Set[]> {
    const filter: Filter<SetDoc> = {};
    if (params.where?.authorId) filter.authorId = params.where.authorId;

    const docs = await this.mongo.sets.find(filter).toArray();
    return Promise.all(docs.map((d) => this.populateSet(d)));
  }

  async createSet(data: SetCreateData): Promise<Set> {
    const now = new Date();
    const doc: SetDoc = {
      _id: data.id || crypto.randomUUID(),
      authorId: data.authorId,
      title: data.title,
      description: data.description ?? null,
      private: data.private,
      folderIds: data.folderIds ?? [],
      createdAt: now,
      updatedAt: now
    };
    await this.mongo.sets.insertOne(doc);

    if (doc.folderIds.length > 0) {
      await this.mongo.folders.updateMany(
          { _id: { $in: doc.folderIds } },
          { $addToSet: { setIds: doc._id } }
      );
    }

    return this.populateSet(doc);
  }

  async updateSet(params: { where: SetUniqueWhere; data: SetUpdateData }): Promise<Set> {
    const filter = uniqueFilter(params.where);
    const current = await this.mongo.sets.findOne(filter);
    if (!current) throw new Error("Set not found");

    const update: Partial<SetDoc> = { updatedAt: new Date() };
    if (params.data.title !== undefined) update.title = params.data.title;
    if (params.data.description !== undefined) update.description = params.data.description;
    if (params.data.private !== undefined) update.private = params.data.private;
    if (params.data.folderIds !== undefined) update.folderIds = params.data.folderIds;

    await this.mongo.sets.updateOne(filter, { $set: update });

    if (params.data.folderIds !== undefined) {
      const oldFolderIds = current.folderIds;
      const newFolderIds = params.data.folderIds;
      const added = newFolderIds.filter((id) => !oldFolderIds.includes(id));
      const removed = oldFolderIds.filter((id) => !newFolderIds.includes(id));

      if (added.length > 0) {
        await this.mongo.folders.updateMany(
            { _id: { $in: added } },
            { $addToSet: { setIds: current._id } }
        );
      }
      if (removed.length > 0) {
        await this.mongo.folders.updateMany(
            { _id: { $in: removed } },
            { $pull: { setIds: current._id } }
        );
      }
    }

    const updated = await this.mongo.sets.findOne(filter);
    if (!updated) throw new Error("Set not found after update");
    return this.populateSet(updated);
  }

  async deleteSet(where: SetUniqueWhere): Promise<Set> {
    const set = await this.set(where);
    if (!set) throw new Error("Set not found");

    const cardIds = set.cards.map((c) => c.id);
    if (cardIds.length > 0) {
      await this.mongo.cardMedia.deleteMany({ cardId: { $in: cardIds } });
      await this.mongo.cards.deleteMany({ setId: set.id });
    }

    if (set.folderIds.length > 0) {
      await this.mongo.folders.updateMany(
          { _id: { $in: set.folderIds } },
          { $pull: { setIds: set.id } }
      );
    }

    await this.mongo.sets.deleteOne({ _id: set.id });
    return set;
  }

  private async populateSet(doc: SetDoc): Promise<Set> {
    const [author, cardDocs, folderDocs] = await Promise.all([
      this.mongo.users.findOne({ _id: doc.authorId }),
      this.mongo.cards.find({ setId: doc._id }).sort({ index: 1 }).toArray(),
      doc.folderIds.length > 0
        ? this.mongo.folders.find({ _id: { $in: doc.folderIds } }).toArray()
        : Promise.resolve([] as FolderDoc[])
    ]);

    const cardIds = cardDocs.map((c) => c._id);
    const mediaDocs = cardIds.length > 0
      ? await this.mongo.cardMedia.find({ cardId: { $in: cardIds } }).toArray()
      : [];

    return {
      id: doc._id,
      authorId: doc.authorId,
      title: doc.title,
      description: doc.description,
      private: doc.private,
      folderIds: doc.folderIds,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      author: authorBasic(author),
      cards: cardDocs.map((c) =>
        cardDocToCard(c, mediaDocs.filter((m) => m.cardId === c._id))
      ),
      folders: folderDocs.map(folderDocToShallowFolder)
    };
  }
}
