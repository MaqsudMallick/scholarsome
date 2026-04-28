import { Card } from "./card";

export interface CardMedia {
  id: string;
  cardId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  card: Card;
}
