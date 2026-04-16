import { Module } from "@nestjs/common";
import { AiController } from "./ai.controller";
import { AiService } from "./ai.service";
import { HttpModule } from "@nestjs/axios";
import { ThrottlerModule } from "@nestjs/throttler";

@Module({
  imports: [
    HttpModule,
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 10
    }])
  ],
  controllers: [AiController],
  providers: [AiService]
})
export class AiModule {}
