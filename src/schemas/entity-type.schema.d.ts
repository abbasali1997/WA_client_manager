import { Document, Types } from "mongoose";
export type EntityTypeDocument = EntityType & Document;
export declare class EntityType {
    _id: Types.ObjectId;
    title: string;
    color: string;
    userId: Types.ObjectId;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export declare const EntityTypeSchema: import("mongoose").Schema<EntityType, import("mongoose").Model<EntityType, any, any, any, Document<unknown, any, EntityType, any, {}> & EntityType & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, EntityType, Document<unknown, {}, import("mongoose").FlatRecord<EntityType>, {}, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & import("mongoose").FlatRecord<EntityType> & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}>;
