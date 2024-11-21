import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { ExamController } from './exam.controller';
import { ExamService } from './exam.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Exam } from './exam.entity';
import { examProviders } from './exam.providers';
import { CourseModule } from 'src/course-module/course-module.entity';
import { QuestionModule } from 'src/question/question.module';
import { QuestionOptionModule } from 'src/question-option/question-option.module';
import { ExamAnswerModule } from 'src/exam-answer/exam-answer.module';

@Module({
  imports: [
    DatabaseModule,
    TypeOrmModule.forFeature([Exam, CourseModule]),
    QuestionModule,
    QuestionOptionModule,
  ],
  controllers: [ExamController],
  providers: [...examProviders, ExamService],
  exports: [ExamService],
})
export class ExamModule {}
