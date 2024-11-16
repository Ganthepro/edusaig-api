import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToMany, OneToOne, JoinColumn } from "typeorm";
import { ExamStatus } from "src/shared/enums";
import { CourseModule } from "src/course-module/course-module.entity";

@Entity()
export class Exam {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @OneToOne(() => CourseModule, (courseModule) => courseModule.exam, {
        onDelete: 'CASCADE',
        nullable: false,
    })
    @JoinColumn({ name: 'course_module_id' })
    courseModule: CourseModule;

    @Column({
        nullable: false,
    })
    title: string;

    @Column({
        nullable: true,
    })
    description: string;

    @Column({
        nullable: false,
        default: 20,
    })
    timeLimit: number;

    @Column({
        nullable: false,
    })
    passingScore: number;

    @Column({
        nullable: false,
    })
    maxAttempts: number;

    @Column({
        nullable: false,
        default: false,
    })
    shuffleQuestions: boolean;

    @Column({
        enum: ExamStatus,
        nullable: false,
        default: ExamStatus.DRAFT,
    })
    status: ExamStatus;

    @CreateDateColumn({
        type: "timestamp with time zone"
    })
    createdAt: Date;

    @UpdateDateColumn({
        type: "timestamp with time zone"
    })
    updatedAt: Date;
}