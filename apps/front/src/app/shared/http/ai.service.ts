import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { lastValueFrom } from "rxjs";
import { ApiResponse, ApiResponseOptions } from "@scholarsome/shared";

@Injectable({
  providedIn: "root"
})
export class AiService {
  constructor(private readonly http: HttpClient) {}

  async isAvailable(): Promise<boolean> {
    try {
      const res = await lastValueFrom(
        this.http.get<ApiResponse<{ available: boolean }>>("/api/ai/status")
      );
      return res.status === ApiResponseOptions.Success && res.data.available;
    } catch {
      return false;
    }
  }

  async generateCard(content: string): Promise<{ term: string; definition: string; error?: string } | null> {
    try {
      const res = await lastValueFrom(
        this.http.post<ApiResponse<{ term: string; definition: string }>>("/api/ai/generate-card", { content })
      );

      if (res.status === ApiResponseOptions.Success) {
        return res.data;
      }
      return null;
    } catch (e: any) {
      if (e.status === 429) {
        return { term: "", definition: "", error: "AI usage limit reached. Please try again later or fill in the card manually." };
      }
      if (e.status === 503) {
        return { term: "", definition: "", error: "AI feature is not configured." };
      }
      return { term: "", definition: "", error: "Failed to generate card. Please try again or fill in the card manually." };
    }
  }
}
