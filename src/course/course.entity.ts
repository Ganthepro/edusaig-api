import { Entity, ManyToOne } from "typeorm";
import { Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { User } from "src/user/user.entity";
import { CourseLevel } from "src/shared/enums/course-level.enum";
import { CourseStatus } from "src/shared/enums/course-status.enum";


@Entity()
export class Course {
    @PrimaryGeneratedColumn("uuid")
    id: string;
    @Column({
        type: String,
        nullable: false,
    })
    title: string;
    @Column({
        type: String,
        nullable: false,
    })
    description: string;

    @ManyToOne(() => User, user => user.courses)
    teacher: User;

    @Column({
        type: String,
        nullable: false,
    })
    thumbnail: string;

    @Column({
        type: Number,
        nullable: false,
    })
    duration: number;

    @Column({
        type: 'enum',
        nullable: false,
        enum: CourseLevel,
        default: CourseLevel.BEGINNER,
    })
    level: CourseLevel;

    @Column({
        type: Number,
        nullable: false,
    })
    price: number;

    @Column({
        type: 'enum',
        nullable: false,
        enum: CourseStatus,
        default: CourseStatus.DRAFT,
    })
    status: CourseStatus;

    @CreateDateColumn({
        type: "timestamp",
        nullable: false,
    })
    createdAt: Date;

    @UpdateDateColumn({
        type: "timestamp",
        nullable: false,
    })
    updatedAt: Date;
}