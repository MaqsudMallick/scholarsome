import { Set } from "./set";
import { UserBasic } from "./user";

export interface Folder {
  id: string;
  parentFolderId: string | null;
  authorId: string;
  name: string;
  description: string | null;
  color: string;
  private: boolean;
  setIds: string[];
  createdAt: Date;
  updatedAt: Date;
  author: UserBasic;
  sets: Set[];
  subfolders: Folder[];
}
