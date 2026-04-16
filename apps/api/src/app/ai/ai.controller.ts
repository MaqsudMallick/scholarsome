import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  UseGuards
} from "@nestjs/common";
import { AiService } from "./ai.service";
import { GenerateCardDto } from "./dto/generate-card.dto";
import { ApiExcludeEndpoint } from "@nestjs/swagger";
import { AuthenticatedGuard } from "../auth/guards/authenticated.guard";
import { ThrottlerGuard } from "@nestjs/throttler";
import { ApiResponse, ApiResponseOptions } from "@scholarsome/shared";

@UseGuards(ThrottlerGuard)
@Controller("ai")
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @ApiExcludeEndpoint()
  @Get("status")
  status(): ApiResponse<{ available: boolean }> {
    return {
      status: ApiResponseOptions.Success,
      data: { available: this.aiService.isAvailable() }
    };
  }

  @ApiExcludeEndpoint()
  @UseGuards(AuthenticatedGuard)
  @Post("generate-card")
  async generateCard(@Body() body: GenerateCardDto): Promise<ApiResponse<{ term: string; definition: string }>> {
    if (!this.aiService.isAvailable()) {
      throw new HttpException(
        { status: ApiResponseOptions.Fail, message: "AI feature is not configured" },
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }

    try {
      const result = await this.aiService.generateCard(body.content);

      return {
        status: ApiResponseOptions.Success,
        data: result
      };
    } catch (e) {
      if (e.response?.status === 429) {
        throw new HttpException(
          { status: ApiResponseOptions.Fail, message: "AI usage limit reached. Please try again later or fill in the card manually." },
          HttpStatus.TOO_MANY_REQUESTS
        );
      }

      throw new HttpException(
        { status: ApiResponseOptions.Fail, message: "Failed to generate card. Please try again or fill in the card manually." },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
