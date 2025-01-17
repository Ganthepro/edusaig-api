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
  FindOptionsSelect,
  FindOptionsWhere,
  ILike,
  Not,
  Repository,
} from 'typeorm';
import { PaginatedQuestionResponseDto } from './dtos/question-response.dto';
import { createPagination } from 'src/shared/pagination';
import { CourseStatus, ExamStatus, QuestionType, Role } from 'src/shared/enums';
import {
  CreateQuestionDto,
  CreateQuestionPretestDto,
} from './dtos/create-question.dto';
import { UpdateQuestionDto } from './dtos/update-question.dto';
import { Exam } from 'src/exam/exam.entity';
import { Pretest } from 'src/pretest/pretest.entity';
import { PaginatedQuestionPretestResponseDto } from './dtos/question-pretest-response.dto';
@Injectable()
export class QuestionService {
  constructor(
    @Inject('QuestionRepository')
    private readonly questionRepository: Repository<Question>,
    @Inject('ExamRepository')
    private readonly examRepository: Repository<Exam>,
    @Inject('PretestRepository')
    private readonly pretestRepository: Repository<Pretest>,
  ) {}

  async findAll(
    userId: string,
    role: Role,
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

    const whereCondition = this.validateAndCreateCondition(
      userId,
      role,
      search,
    );
    const question = await find({
      order: {
        orderIndex: 'ASC',
      },
      where: whereCondition,
      relations: [
        'exam',
        'exam.courseModule',
        'exam.courseModule.course',
        'exam.courseModule.course.teacher',
      ],
      select: {
        exam: this.selectPopulateExam(),
      },
    }).run();

    return question;
  }

  async findOne(
    userId: string,
    role: Role,
    options: FindOneOptions<Question> = {},
  ): Promise<Question> {
    const whereCondition = this.validateAndCreateCondition(userId, role, '');

    const where = Array.isArray(whereCondition)
      ? [
          { ...whereCondition[0], ...options.where },
          { ...whereCondition[1], ...options.where },
        ]
      : { ...whereCondition, ...options.where };

    const question = await this.questionRepository.findOne({
      ...options,
      where,
      relations: [
        'exam',
        'exam.courseModule',
        'exam.courseModule.course',
        'exam.courseModule.course.teacher',
      ],
      select: {
        exam: this.selectPopulateExam(),
      },
    });

    if (!question) {
      throw new NotFoundException('Question not found');
    }

    return question;
  }

  async findQuestionByExamId(
    userId: string,
    role: Role,
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

    const whereCondition = this.validateAndCreateCondition(
      userId,
      role,
      search,
    );
    whereCondition['exam'] = { id: examId };

    const exam = await this.examRepository.findOne({
      where: { id: examId },
    });

    if (!exam) {
      throw new NotFoundException('Exam not found.');
    }

    if (!exam.shuffleQuestions) {
      const question = await find({
        order: {
          orderIndex: 'ASC',
        },
        where: whereCondition,
        relations: [
          'exam',
          'exam.courseModule',
          'exam.courseModule.course',
          'exam.courseModule.course.teacher',
        ],
        select: {
          exam: this.selectPopulateExam(),
        },
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
      relations: [
        'exam',
        'exam.courseModule',
        'exam.courseModule.course',
        'exam.courseModule.course.teacher',
      ],
      select: {
        exam: this.selectPopulateExam(),
      },
    }).run();
  }

  private validateAndCreateCondition(
    userId: string,
    role: Role,
    search: string,
  ): FindOptionsWhere<Question> {
    const baseSearch = search ? { question: ILike(`%${search}%`) } : {};

    if (role === Role.STUDENT) {
      return {
        ...baseSearch,
        exam: {
          status: ExamStatus.PUBLISHED,
          courseModule: {
            course: {
              status: CourseStatus.PUBLISHED,
              enrollments: {
                user: {
                  id: userId,
                },
              },
            },
          },
        },
      };
    }

    if (role === Role.TEACHER) {
      return {
        ...baseSearch,
        exam: [
          {
            courseModule: {
              course: {
                teacher: { id: userId },
              },
            },
          },
        ],
      };
    }

    if (role === Role.ADMIN) {
      return { ...baseSearch };
    }

    return {
      ...baseSearch,
      exam: {
        status: ExamStatus.PUBLISHED,
        courseModule: {
          course: {
            status: CourseStatus.PUBLISHED,
            enrollments: {
              user: {
                id: userId,
              },
            },
          },
        },
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
      select: this.selectPopulateExam(),
      relations: [
        'courseModule',
        'courseModule.course',
        'courseModule.course.teacher',
      ],
    });
    if (!exam) {
      throw new NotFoundException('Exam not found.');
    }
    const question = await this.questionRepository.create({
      ...createQuestionDto,
      exam,
    });
    if (!question) throw new BadRequestException('Can not create question');
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
    userId: string,
    role: Role,
    id: string,
    updateQuestionDto: UpdateQuestionDto,
  ): Promise<Question> {
    const question = await this.findOne(userId, role, { where: { id } });
    if (this.checkPermission(userId, role, question) === false)
      throw new BadRequestException('Can not change this question');
    try {
      const question = await this.questionRepository.update(
        id,
        updateQuestionDto,
      );
      if (!question) throw new BadRequestException("Can't update question");
      return await this.questionRepository.findOne({
        where: { id },
        relations: [
          'exam',
          'exam.courseModule',
          'exam.courseModule.course',
          'exam.courseModule.course.teacher',
        ],
        select: {
          exam: this.selectPopulateExam(),
        },
      });
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
    userId: string,
    role: Role,
    id: string,
  ): Promise<Question> {
    try {
      const question = await this.findOne(userId, role, { where: { id } });
      if (this.checkPermission(userId, role, question) === false)
        throw new BadRequestException('Can not change this question');
      const removeQuestion = await this.questionRepository.remove(question);
      await this.reOrderIndex(question.examId);
      return removeQuestion;
    } catch (error) {
      if (error instanceof Error)
        throw new NotFoundException('Question not found');
    }
  }

  private selectPopulateExam(): FindOptionsSelect<Exam> {
    return {
      id: true,
      title: true,
      description: true,
      timeLimit: true,
      passingScore: true,
      maxAttempts: true,
      shuffleQuestions: true,
      status: true,
      courseModule: {
        id: true,
        course: {
          id: true,
          teacher: {
            id: true,
          },
        },
      },
    };
  }

  async findAllQuestionPretest(
    userId: string,
    role: Role,
    {
      page = 1,
      limit = 20,
      search = '',
    }: {
      page?: number;
      limit?: number;
      search?: string;
    },
  ): Promise<PaginatedQuestionPretestResponseDto> {
    const { find } = await createPagination(this.questionRepository, {
      page,
      limit,
    });

    const whereCondition = this.validateAndCreateConditionForPretest(
      userId,
      role,
      search,
    );
    const question = await find({
      order: {
        orderIndex: 'ASC',
      },
      where: whereCondition,
      relations: ['pretest', 'pretest.user'],
      select: {
        pretest: this.selectPopulatePretest(),
      },
    }).run();

    return question;
  }

  async findQuestionPretestByPretestId(
    userId: string,
    role: Role,
    pretestId: string,
    {
      page = 1,
      limit = 20,
      search = '',
    }: {
      page?: number;
      limit?: number;
      search?: string;
    },
  ): Promise<PaginatedQuestionPretestResponseDto> {
    const { find } = await createPagination(this.questionRepository, {
      page,
      limit,
    });

    const whereCondition = this.validateAndCreateConditionForPretest(
      userId,
      role,
      search,
    );
    whereCondition['pretest'] = { id: pretestId };

    const pretest = await this.pretestRepository.findOne({
      where: { id: pretestId },
    });

    if (!pretest) {
      throw new NotFoundException('Pretest not found.');
    }

    const question = await find({
      order: {
        orderIndex: 'ASC',
      },
      where: whereCondition,
      relations: ['pretest', 'pretest.user'],
      select: {
        pretest: this.selectPopulatePretest(),
      },
    }).run();
    return question;
  }

  private validateAndCreateConditionForPretest(
    userId: string,
    role: Role,
    search: string,
  ): FindOptionsWhere<Question> {
    const baseSearch = search ? { question: ILike(`%${search}%`) } : {};

    if (role === Role.STUDENT) {
      return {
        ...baseSearch,
        pretest: {
          user: {
            id: userId,
          },
        },
      };
    }

    if (role === Role.ADMIN) {
      return { ...baseSearch };
    }

    return {
      ...baseSearch,
      pretest: {
        user: {
          id: userId,
        },
      },
    };
  }

  async createQuestionForPretest(
    createQuestionPretestDto: CreateQuestionPretestDto,
  ): Promise<Question> {
    const pretest = await this.pretestRepository.findOne({
      where: { id: createQuestionPretestDto.pretestId },
    });

    if (!pretest) throw new NotFoundException('Not found pretest');

    const question = this.questionRepository.create({
      ...createQuestionPretestDto,
      pretest,
    });

    if (!question)
      throw new BadRequestException('Cannot create pretest question');

    await this.questionRepository.save(question);
    return question;
  }

  private selectPopulatePretest(): FindOptionsSelect<Pretest> {
    return {
      id: true,
      title: true,
      description: true,
      timeLimit: true,
      passingScore: true,
      maxAttempts: true,
      user: {
        id: true,
        username: true,
        fullname: true,
        role: true,
        email: true,
        profileKey: true,
      },
    };
  }

  private checkPermission(
    userId: string,
    role: Role,
    question: Question,
  ): boolean {
    switch (role) {
      case Role.ADMIN:
        return true;
      case Role.TEACHER:
        return question.exam.courseModule?.course?.teacher?.id == userId;
      case Role.STUDENT:
        return false;
    }
  }
}
