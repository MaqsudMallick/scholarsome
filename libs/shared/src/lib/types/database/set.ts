import { Card } from "./card";
import { Folder } from "./folder";
import { UserBasic } from "./user";

export interface Set {
  id: string;
  authorId: string;
  title: string;
  description: string | null;
  private: boolean;
  folderIds: string[];
  createdAt: Date;
  updatedAt: Date;
  author: UserBasic;
  cards: Card[];
  folders: Folder[];
}
