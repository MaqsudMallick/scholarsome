import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HttpService } from "@nestjs/axios";
import { lastValueFrom } from "rxjs";

@Injectable()
export class AiService {
  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService
  ) {}

  isAvailable(): boolean {
    const key = this.configService.get<string>("GROQ_API_KEY");
    return !!key && key.length > 0;
  }

  async generateCard(content: string): Promise<{ term: string; definition: string }> {
    const apiKey = this.configService.get<string>("GROQ_API_KEY");

    const response = await lastValueFrom(
      this.httpService.post(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          model: "llama-3.1-8b-instant",
          messages: [
            {
              role: "system",
              content: "You are a flashcard generator. Given some content, extract the most important concept and create a single flashcard with a concise term and a clear definition. Respond ONLY with valid JSON in this exact format: {\"term\": \"...\", \"definition\": \"...\"}. Do not include any other text, markdown, or explanation."
            },
            {
              role: "user",
              content: content
            }
          ],
          temperature: 0.3,
          max_tokens: 300
        },
        {
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          }
        }
      )
    );

    const message = response.data.choices[0].message.content.trim();

    const parsed = JSON.parse(message);

    return {
      term: parsed.term,
      definition: parsed.definition
    };
  }
}
