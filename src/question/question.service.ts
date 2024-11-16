import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Question } from './question.entity';
import {
  FindOneOptions,
  FindOptionsWhere,
  ILike,
  Raw,
  Repository,
} from 'typeorm';
import { PaginatedQuestionResponseDto } from './dtos/question-response.dto';
import { createPagination } from 'src/shared/pagination';
import { AuthenticatedRequest } from 'src/auth/interfaces/authenticated-request.interface';
import { ExamStatus, Role } from 'src/shared/enums';
import { CreateQuestionDto } from './dtos/create-question.dto';
import { UpdateQuestionDto } from './dtos/update-question.dto';
import { Exam } from 'src/exam/exam.entity';
@Injectable()
export class QuestionService {
  constructor(
    @Inject('QuestionRepository')
    private readonly questionRepository: Repository<Question>,
    @Inject('ExamRepository')
    private readonly examRepository: Repository<Exam>,
  ) {}

  async findAll(
    request: AuthenticatedRequest,
    {
      page = 1,
      limit = 20,
      search = '',
    }: {
      page?: number;
      limit?: number;
      search?: string;
    },
  ): Promise<PaginatedQuestionResponseDto> {
    const { find } = await createPagination(this.questionRepository, {
      page,
      limit,
    });

    const whereCondition = this.validateAndCreateCondition(request, search);
    const question = await find({
      order: {
        orderIndex: 'ASC',
      },
      where: whereCondition,
      relations: ['exam'],
    }).run();

    return question;
  }

  async findOne(
    request: AuthenticatedRequest,
    options: FindOneOptions<Question> = {},
  ): Promise<Question> {
    const whereCondition = this.validateAndCreateCondition(request, '');

    const question = await this.questionRepository.findOne({
      ...options,
      where: whereCondition,
      relations: ['exam'],
    });

    if (!question) {
      throw new NotFoundException('Question not found');
    }

    return question;
  }

  async findQuestionByExamId(
    request: AuthenticatedRequest,
    examId: string,
    {
      page = 1,
      limit = 20,
      search = '',
    }: {
      page?: number;
      limit?: number;
      search?: string;
    },
  ): Promise<PaginatedQuestionResponseDto> {
    const { find } = await createPagination(this.questionRepository, {
      page,
      limit,
    });

    const whereCondition = this.validateAndCreateCondition(request, search);
    whereCondition['exam'] = { id: examId };

    const exam = await this.examRepository.findOne({
      where: { id: examId },
    });

    if (!exam.shuffleQuestions) {
      const question = await find({
        order: {
          orderIndex: 'ASC',
        },
        where: whereCondition,
      }).run();
      return question;
    }

    const baseQuery = this.questionRepository
      .createQueryBuilder('question')
      .where(whereCondition)
      .orderBy('RANDOM()');

    return await find({
      where: whereCondition,
      ...{
        __queryBuilder: baseQuery,
      },
    }).run();
  }

  private validateAndCreateCondition(
    request: AuthenticatedRequest,
    search: string,
  ): FindOptionsWhere<Question> {
    const baseSearch = search ? { question: ILike(`%${search}%`) } : {};

    if (request.user.role === Role.STUDENT) {
      return {
        ...baseSearch,
        exam: {
          status: ExamStatus.PUBLISHED,
        },
      };
    }

    if (request.user.role === Role.TEACHER) {
      return {
        ...baseSearch,
        exam: {
          courseModule: {
            course: {
              teacher: {
                id: request.user.id,
              },
            },
          },
        },
      };
    }

    if (request.user.role === Role.ADMIN) {
      return { ...baseSearch };
    }

    return {
      ...baseSearch,
      exam: {
        status: ExamStatus.PUBLISHED,
      },
    };
  }

  async getMaxOrderIndex(examId: string): Promise<number> {
    const result = await this.questionRepository
      .createQueryBuilder('question')
      .select('MAX(question.orderIndex)', 'max')
      .where('question.examId = :examId', { examId })
      .getRawOne();

    return result.max ? Number(result.max) : 0;
  }

  async reOrderIndex(examId: string): Promise<void> {
    const questionToReorder = await this.questionRepository.find({
      where: { examId },
      order: { orderIndex: 'ASC' },
    });

    for (let i = 0; i < questionToReorder.length; i++) {
      questionToReorder[i].orderIndex = i + 1;
    }

    await this.questionRepository.save(questionToReorder);
  }

  async createQuestion(
    createQuestionDto: CreateQuestionDto,
  ): Promise<Question> {
    if (!createQuestionDto.orderIndex) {
      createQuestionDto.orderIndex =
        (await this.getMaxOrderIndex(createQuestionDto.examId)) + 1;
    }
    const exam = await this.examRepository.findOne({
      where: { id: createQuestionDto.examId },
    });
    if (!exam) {
      throw new NotFoundException('Exam not found.');
    }
    const question = this.questionRepository.create({
      ...createQuestionDto,
      exam,
    });
    try {
      await this.questionRepository.save(question);
      return question;
    } catch (error) {
      if (error.code === '23505') {
        throw new ConflictException(
          'Same orderIndex already exists in this exam.',
        );
      }
      throw new BadRequestException(
        "Can't create question. Please check your input.",
      );
    }
  }

  async updateQuestion(
    request: AuthenticatedRequest,
    id: string,
    updateQuestionDto: UpdateQuestionDto,
  ): Promise<Question> {
    await this.findOne(request, { where: { id } });
    try {
      const question = await this.questionRepository.update(
        id,
        updateQuestionDto,
      );
      if (!question) throw new NotFoundException("Can't update question");
      return await this.questionRepository.findOne({ where: { id } });
    } catch (error) {
      if (error.code === '23505') {
        throw new ConflictException(
          'Same orderIndex already exists in this exam.',
        );
      }
      throw new BadRequestException(
        "Can't update question. Please check your input.",
      );
    }
  }

  async deleteQuestion(
    request: AuthenticatedRequest,
    id: string,
  ): Promise<void> {
    try {
      const question = await this.findOne(request, { where: { id } });
      await this.questionRepository.delete(id);
      await this.reOrderIndex(question.examId);
    } catch (error) {
      if (error instanceof Error)
        throw new NotFoundException('Question not found');
    }
  }
}
