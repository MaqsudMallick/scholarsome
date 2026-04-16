import { IsString, MinLength, MaxLength } from "class-validator";

export class GenerateCardDto {
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
    content: string;
}
