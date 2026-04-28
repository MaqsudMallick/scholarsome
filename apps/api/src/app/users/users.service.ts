import { Injectable } from "@nestjs/common";
import * as crypto from "crypto";
import { Filter } from "mongodb";
import { User } from "@scholarsome/shared";
import { MongoService, SetDoc, FolderDoc, UserDoc } from "../providers/database/mongo.service";

export interface UserUniqueWhere {
  id?: string;
  email?: string;
  username?: string;
}

export interface UserCreateData {
  id?: string;
  username: string;
  email: string;
  password: string;
  verified?: boolean;
}

export interface UserUpdateData {
  username?: string;
  email?: string;
  password?: string;
  verified?: boolean;
}

function userDocToUser(doc: UserDoc, sets: SetDoc[], folders: FolderDoc[]): User {
  return {
    id: doc._id,
    username: doc.username,
    email: doc.email,
    password: doc.password,
    verified: doc.verified,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    // Sets and folders carry minimal shape — controllers only read scalar
    // fields like .private. Relations on these are not populated here.
    sets: sets.map((s) => ({
      id: s._id,
      authorId: s.authorId,
      title: s.title,
      description: s.description,
      private: s.private,
      folderIds: s.folderIds,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      author: undefined as never,
      cards: [],
      folders: []
    })),
    folders: folders.map((f) => ({
      id: f._id,
      parentFolderId: f.parentFolderId,
      authorId: f.authorId,
      name: f.name,
      description: f.description,
      color: f.color,
      private: f.private,
      setIds: f.setIds,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
      author: undefined as never,
      sets: [],
      subfolders: []
    }))
  };
}

function uniqueFilter(where: UserUniqueWhere): Filter<UserDoc> {
  if (where.id) return { _id: where.id };
  if (where.email) return { email: where.email };
  if (where.username) return { username: where.username };
  throw new Error("UserUniqueWhere must include id, email, or username");
}

@Injectable()
export class UsersService {
  constructor(private readonly mongo: MongoService) {}

  async getSitemapUserInfo(): Promise<{ id: string, updatedAt: Date }[]> {
    const docs = await this.mongo.users
        .find({}, { projection: { _id: 1, updatedAt: 1 } })
        .toArray();
    return docs.map((d) => ({ id: d._id, updatedAt: d.updatedAt }));
  }

  async user(where: UserUniqueWhere): Promise<User | null> {
    const doc = await this.mongo.users.findOne(uniqueFilter(where));
    if (!doc) return null;

    const [sets, folders] = await Promise.all([
      this.mongo.sets.find({ authorId: doc._id }).toArray(),
      this.mongo.folders.find({ authorId: doc._id }).toArray()
    ]);

    return userDocToUser(doc, sets, folders);
  }

  async users(): Promise<User[]> {
    const docs = await this.mongo.users.find({}).toArray();
    const ids = docs.map((d) => d._id);

    const [sets, folders] = await Promise.all([
      this.mongo.sets.find({ authorId: { $in: ids } }).toArray(),
      this.mongo.folders.find({ authorId: { $in: ids } }).toArray()
    ]);

    return docs.map((d) =>
      userDocToUser(
          d,
          sets.filter((s) => s.authorId === d._id),
          folders.filter((f) => f.authorId === d._id)
      )
    );
  }

  async createUser(data: UserCreateData): Promise<User> {
    const now = new Date();
    const doc: UserDoc = {
      _id: data.id || crypto.randomUUID(),
      username: data.username,
      email: data.email,
      password: data.password,
      verified: data.verified ?? false,
      createdAt: now,
      updatedAt: now
    };
    await this.mongo.users.insertOne(doc);
    return userDocToUser(doc, [], []);
  }

  async updateUser(params: {
    where: UserUniqueWhere;
    data: UserUpdateData;
  }): Promise<User> {
    const result = await this.mongo.users.findOneAndUpdate(
        uniqueFilter(params.where),
        { $set: { ...params.data, updatedAt: new Date() } },
        { returnDocument: "after" }
    );
    if (!result) throw new Error("User not found");

    const [sets, folders] = await Promise.all([
      this.mongo.sets.find({ authorId: result._id }).toArray(),
      this.mongo.folders.find({ authorId: result._id }).toArray()
    ]);

    return userDocToUser(result, sets, folders);
  }

  async deleteUser(where: UserUniqueWhere): Promise<UserDoc> {
    const result = await this.mongo.users.findOneAndDelete(uniqueFilter(where));
    if (!result) throw new Error("User not found");
    return result;
  }
}
