import {
  ArrayNotEmpty,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class BulkNotificationDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  deviceIds: string[];

  @IsNotEmpty()
  @IsString()
  title: string;

  @IsNotEmpty()
  @IsString()
  body: string;

  @IsOptional()
  data?: Record<string, string>;
}
