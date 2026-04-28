import { Injectable } from "@nestjs/common";
import * as crypto from "crypto";
import * as sharp from "sharp";
import { Filter } from "mongodb";
import { Card, CardMedia } from "@scholarsome/shared";
import { CardDoc, CardMediaDoc, MongoService, SetDoc } from "../providers/database/mongo.service";
import { StorageService } from "../providers/storage/storage.service";

export interface CardUniqueWhere {
  id?: string;
}

export interface CardCreateData {
  id?: string;
  setId: string;
  index: number;
  term: string;
  definition: string;
}

export interface CardUpdateData {
  index?: number;
  term?: string;
  definition?: string;
}

export interface CardMediaUniqueWhere {
  id?: string;
}

export interface CardMediaCreateData {
  cardId: string;
  name: string;
}

export interface CardMediaUpdateData {
  name?: string;
}

function setDocAsSetWithoutCards(doc: SetDoc) {
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

function cardMediaDocToCardMedia(doc: CardMediaDoc): CardMedia {
  return {
    id: doc._id,
    cardId: doc.cardId,
    name: doc.name,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    card: undefined as never
  };
}

function uniqueCardFilter(where: CardUniqueWhere): Filter<CardDoc> {
  if (where.id) return { _id: where.id };
  throw new Error("CardUniqueWhere requires id");
}

function uniqueCardMediaFilter(where: CardMediaUniqueWhere): Filter<CardMediaDoc> {
  if (where.id) return { _id: where.id };
  throw new Error("CardMediaUniqueWhere requires id");
}

@Injectable()
export class CardsService {
  constructor(
    private readonly mongo: MongoService,
    private readonly storageService: StorageService
  ) {}

  async scanAndUploadMedia(side: string, setId: string): Promise<{ scanned: string; media: string[] } | false> {
    const matches = side.match(/<[^>]+src="([^">]+)"/g);
    const media: string[] = [];

    if (matches) {
      let sources = Object.values(matches);
      if (!sources) return false;

      sources = sources.map((x) => x.replace(/.*src="([^"]*)".*/, "$1"));

      for (const source of sources) {
        const split: string[] = source.split(",");
        if (split.length === 0 || split.length !== 2) continue;

        let decoded = Buffer.from(split[1], "base64");
        let extension = "." + source.match(/^data:[a-z]+\/([a-z]+);base64,/)[1];

        if (
          split[0].includes("jpeg") ||
          split[0].includes("jpg") ||
          split[0].includes("png") ||
          split[0].includes("tiff") ||
          split[0].includes("webp")
        ) {
          decoded = await sharp(decoded).jpeg({ progressive: true, force: true, quality: 80 }).toBuffer();
          extension = ".jpeg";
        }

        const name = crypto.randomUUID() + extension;
        media.push(name);

        const fileName = setId + "/" + name;
        await this.storageService.getInstance().putFile("media/sets/" + fileName, decoded);

        side = side.replace(source, "/api/sets/" + setId + "/media/" + name);
      }
    } else return false;

    return { scanned: side, media };
  }

  async deleteMedia(setId: string, fileName: string) {
    return await this.storageService.getInstance()
        .deleteFile("media/sets/" + setId + "/" + fileName);
  }

  async card(where: CardUniqueWhere): Promise<Card | null> {
    const doc = await this.mongo.cards.findOne(uniqueCardFilter(where));
    if (!doc) return null;
    return this.populateCard(doc);
  }

  async cards(params: { where?: { setId?: string } } = {}): Promise<Card[]> {
    const filter: Filter<CardDoc> = {};
    if (params.where?.setId) filter.setId = params.where.setId;

    const docs = await this.mongo.cards.find(filter).sort({ index: 1 }).toArray();
    return Promise.all(docs.map((d) => this.populateCard(d)));
  }

  async createCard(data: CardCreateData): Promise<CardDoc> {
    const now = new Date();
    const doc: CardDoc = {
      _id: data.id ?? crypto.randomUUID(),
      setId: data.setId,
      index: data.index,
      term: data.term,
      definition: data.definition,
      createdAt: now,
      updatedAt: now
    };
    await this.mongo.cards.insertOne(doc);
    return doc;
  }

  async updateCard(params: { where: CardUniqueWhere; data: CardUpdateData }): Promise<CardDoc> {
    const filter = uniqueCardFilter(params.where);
    const result = await this.mongo.cards.findOneAndUpdate(
        filter,
        { $set: { ...params.data, updatedAt: new Date() } },
        { returnDocument: "after" }
    );
    if (!result) throw new Error("Card not found");
    return result;
  }

  async deleteCard(where: CardUniqueWhere): Promise<CardDoc> {
    const filter = uniqueCardFilter(where);
    const card = await this.mongo.cards.findOne(filter);
    if (!card) throw new Error("Card not found");

    await this.mongo.cardMedia.deleteMany({ cardId: card._id });
    await this.mongo.cards.deleteOne(filter);
    return card;
  }

  async deleteCardsBySetId(setId: string): Promise<void> {
    const cards = await this.mongo.cards.find({ setId }, { projection: { _id: 1 } }).toArray();
    if (cards.length === 0) return;

    const cardIds = cards.map((c) => c._id);
    await this.mongo.cardMedia.deleteMany({ cardId: { $in: cardIds } });
    await this.mongo.cards.deleteMany({ setId });
  }

  async createCardsForSet(setId: string, cards: Array<{ id?: string; index: number; term: string; definition: string }>): Promise<void> {
    if (cards.length === 0) return;

    const now = new Date();
    const docs: CardDoc[] = cards.map((c) => ({
      _id: c.id ?? crypto.randomUUID(),
      setId,
      index: c.index,
      term: c.term,
      definition: c.definition,
      createdAt: now,
      updatedAt: now
    }));

    await this.mongo.cards.insertMany(docs);
  }

  async cardMedia(where: CardMediaUniqueWhere): Promise<CardMedia | null> {
    const doc = await this.mongo.cardMedia.findOne(uniqueCardMediaFilter(where));
    if (!doc) return null;
    return cardMediaDocToCardMedia(doc);
  }

  async cardMedias(params: { where?: { cardId?: string } } = {}): Promise<CardMedia[]> {
    const filter: Filter<CardMediaDoc> = {};
    if (params.where?.cardId) filter.cardId = params.where.cardId;

    const docs = await this.mongo.cardMedia.find(filter).toArray();
    return docs.map(cardMediaDocToCardMedia);
  }

  async createCardMedia(data: CardMediaCreateData): Promise<CardMediaDoc> {
    const now = new Date();
    const doc: CardMediaDoc = {
      _id: crypto.randomUUID(),
      cardId: data.cardId,
      name: data.name,
      createdAt: now,
      updatedAt: now
    };
    await this.mongo.cardMedia.insertOne(doc);
    return doc;
  }

  async updateCardMedia(params: { where: CardMediaUniqueWhere; data: CardMediaUpdateData }): Promise<CardMediaDoc> {
    const filter = uniqueCardMediaFilter(params.where);
    const result = await this.mongo.cardMedia.findOneAndUpdate(
        filter,
        { $set: { ...params.data, updatedAt: new Date() } },
        { returnDocument: "after" }
    );
    if (!result) throw new Error("CardMedia not found");
    return result;
  }

  async deleteCardMedia(where: CardMediaUniqueWhere): Promise<CardMediaDoc> {
    const filter = uniqueCardMediaFilter(where);
    const result = await this.mongo.cardMedia.findOneAndDelete(filter);
    if (!result) throw new Error("CardMedia not found");
    return result;
  }

  private async populateCard(doc: CardDoc): Promise<Card> {
    const [setDoc, mediaDocs] = await Promise.all([
      this.mongo.sets.findOne({ _id: doc.setId }),
      this.mongo.cardMedia.find({ cardId: doc._id }).toArray()
    ]);

    return {
      id: doc._id,
      setId: doc.setId,
      index: doc.index,
      term: doc.term,
      definition: doc.definition,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      set: setDoc ? setDocAsSetWithoutCards(setDoc) as unknown as Card["set"] : (undefined as never),
      media: mediaDocs.map(cardMediaDocToCardMedia)
    };
  }
}
