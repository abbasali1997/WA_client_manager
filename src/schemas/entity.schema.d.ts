import { Document, Types } from 'mongoose';
export type EntityDocument = Entity & Document;
export declare enum EntityType {
  SYSTEM = 'system',
  ENTITY = 'entity',
  COMPANY = 'company',
  DEPARTMENT = 'department',
  CUSTOM = 'custom',
}
export declare class Entity {
  _id: Types.ObjectId;
  name: string;
  type: EntityType;
  customEntityTypeId: Types.ObjectId;
  parentId: Types.ObjectId;
  path: string;
  entityIdPath: Types.ObjectId[];
  tenantId: Types.ObjectId;
  level: number;
  metadata: Record<string, any>;
  isActive: boolean;
  isExpanded: boolean;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}
export declare const EntitySchema: import('mongoose').Schema<
  Entity,
  import('mongoose').Model<
    Entity,
    any,
    any,
    any,
    Document<unknown, any, Entity, any, {}> &
      Entity &
      Required<{
        _id: Types.ObjectId;
      }> & {
        __v: number;
      },
    any
  >,
  {},
  {},
  {},
  {},
  import('mongoose').DefaultSchemaOptions,
  Entity,
  Document<
    unknown,
    {},
    import('mongoose').FlatRecord<Entity>,
    {},
    import('mongoose').ResolveSchemaOptions<
      import('mongoose').DefaultSchemaOptions
    >
  > &
    import('mongoose').FlatRecord<Entity> &
    Required<{
      _id: Types.ObjectId;
    }> & {
      __v: number;
    }
>;
