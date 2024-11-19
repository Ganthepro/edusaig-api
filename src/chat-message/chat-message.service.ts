import {
    Injectable,
    Inject,
    InternalServerErrorException,
    NotFoundException,
} from '@nestjs/common';
import { Repository, FindOptionsWhere, FindOneOptions } from 'typeorm';
import { ChatMessage } from './chat-message.entity';
import { createPagination } from 'src/shared/pagination';
import {
    UpdateChatMessageDto,
    CreateChatMessageDto,
    PaginatedChatMessageResponseDto,
} from './dtos';

@Injectable()
export class ChatMessageService {
    constructor(
        @Inject('ChatMessageRepository')
        private readonly chatMessageRepository: Repository<ChatMessage>,
    ) { }

    async create(
        userId: string,
        createChatMessageDto: CreateChatMessageDto,
    ): Promise<ChatMessage> {
        try {
            return await this.chatMessageRepository.save({
                ...createChatMessageDto,
                user: { id: userId },
                chatRoomId: { id: createChatMessageDto.chatRoomId },
                reply: createChatMessageDto.replyId
                    ? { id: createChatMessageDto.replyId }
                    : null,
            });
        } catch (error) {
            if (error instanceof Error)
                throw new InternalServerErrorException(error.message);
        }
    }

    async findAll({
        userId,
        page = 1,
        limit = 20,
        search = '',
    }: {
        userId: string;
        page?: number;
        limit?: number;
        search?: string;
    }): Promise<PaginatedChatMessageResponseDto> {
        const { find } = await createPagination(this.chatMessageRepository, {
            page,
            limit,
        });
        const chatMessages = await find({
            where: { content: search, user: { id: userId } },
        }).run();
        return new PaginatedChatMessageResponseDto(
            chatMessages.data,
            chatMessages.meta.total,
            chatMessages.meta.pageSize,
            chatMessages.meta.currentPage,
        );
    }

    async findOne(options: FindOneOptions<ChatMessage>): Promise<ChatMessage> {
        try {
            return await this.chatMessageRepository.findOne(options);
        } catch (error) {
            if (error instanceof Error) throw new NotFoundException(error.message);
        }
    }

    async update(
        criteria: FindOptionsWhere<ChatMessage>,
        updateChatMessageDto: UpdateChatMessageDto,
    ): Promise<ChatMessage> {
        try {
            await this.chatMessageRepository.update(criteria, {
                ...updateChatMessageDto,
                isEdited: true,
            });
            return await this.findOne({ where: criteria });
        } catch (error) {
            if (error instanceof Error) throw new NotFoundException(error.message);
        }
    }

    async delete(criteria: FindOptionsWhere<ChatMessage>): Promise<void> {
        try {
            await this.chatMessageRepository.delete(criteria);
        } catch (error) {
            if (error instanceof Error) throw new NotFoundException(error.message);
        }
    }
}
