import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException
} from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy } from "passport-custom";
import { Request as ExpressRequest } from "express";
import { TokenStoreService } from "../../providers/token-store/token-store.service";
import { TokenUser } from "../types/token-user.interface";

@Injectable()
export class ApiKeyStrategy extends PassportStrategy(Strategy, "apiKey") {
  constructor(private readonly tokenStore: TokenStoreService) {
    super();
  }

  async validate(req: ExpressRequest): Promise<TokenUser> {
    const apiKey = req.header("x-api-key");

    if (!apiKey) {
      throw new UnauthorizedException({
        status: "fail",
        message: "Invalid authentication to access the requested resource"
      });
    }

    const result = this.tokenStore.get("apiToken", apiKey);

    if (!result) {
      throw new InternalServerErrorException("Failed to retrieve API key data");
    }

    return {
      email: (JSON.parse(result) as { id: string; email: string }).email
    };
  }
}
