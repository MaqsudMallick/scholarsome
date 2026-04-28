import { Set } from "./set";
import { Folder } from "./folder";

export interface User {
  id: string;
  username: string;
  email: string;
  password: string;
  verified: boolean;
  createdAt: Date;
  updatedAt: Date;
  sets: Set[];
  folders: Folder[];
}

export interface UserBasic {
  id: string;
  username: string;
  createdAt: Date;
  updatedAt: Date;
}
