import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateExamDto } from './create-exam.dto';

export class UpdateExamDto extends PartialType(
  OmitType(CreateExamDto, ['courseModuleId'] as const),
) {}
