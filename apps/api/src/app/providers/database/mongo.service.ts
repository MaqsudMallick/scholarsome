import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Collection, Db, MongoClient } from "mongodb";

export interface UserDoc {
  _id: string;
  username: string;
  email: string;
  password: string;
  verified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SetDoc {
  _id: string;
  authorId: string;
  title: string;
  description: string | null;
  private: boolean;
  folderIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface FolderDoc {
  _id: string;
  parentFolderId: string | null;
  authorId: string;
  name: string;
  description: string | null;
  color: string;
  private: boolean;
  setIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CardDoc {
  _id: string;
  setId: string;
  index: number;
  term: string;
  definition: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CardMediaDoc {
  _id: string;
  cardId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiKeyDoc {
  _id: string;
  userId: string;
  name: string;
  apiKey: string;
}

@Injectable()
export class MongoService implements OnModuleInit, OnModuleDestroy {
  private client!: MongoClient;
  private database!: Db;

  async onModuleInit(): Promise<void> {
    const uri = process.env.DATABASE_URL;
    if (!uri) throw new Error("DATABASE_URL is not set");

    this.client = new MongoClient(uri);
    await this.client.connect();

    // The database name is encoded in the URI's path component.
    this.database = this.client.db();

    await this.ensureIndexes();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.close();
  }

  db(): Db {
    return this.database;
  }

  get users(): Collection<UserDoc> {
    return this.database.collection<UserDoc>("User");
  }
  get sets(): Collection<SetDoc> {
    return this.database.collection<SetDoc>("Set");
  }
  get folders(): Collection<FolderDoc> {
    return this.database.collection<FolderDoc>("Folder");
  }
  get cards(): Collection<CardDoc> {
    return this.database.collection<CardDoc>("Card");
  }
  get cardMedia(): Collection<CardMediaDoc> {
    return this.database.collection<CardMediaDoc>("CardMedia");
  }
  get apiKeys(): Collection<ApiKeyDoc> {
    return this.database.collection<ApiKeyDoc>("ApiKey");
  }

  private async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.users.createIndex({ username: 1 }, { unique: true }),
      this.users.createIndex({ email: 1 }, { unique: true }),
      this.sets.createIndex({ authorId: 1 }),
      this.folders.createIndex({ parentFolderId: 1, authorId: 1 }),
      this.cards.createIndex({ setId: 1 }),
      this.cardMedia.createIndex({ cardId: 1 }),
      this.apiKeys.createIndex({ apiKey: 1 }, { unique: true }),
      this.apiKeys.createIndex({ userId: 1 })
    ]);
  }
}
