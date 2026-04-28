import { CardMedia } from "./cardMedia";
import { Set } from "./set";

export interface Card {
  id: string;
  setId: string;
  index: number;
  term: string;
  definition: string;
  createdAt: Date;
  updatedAt: Date;
  set: Set;
  media: CardMedia[];
}
