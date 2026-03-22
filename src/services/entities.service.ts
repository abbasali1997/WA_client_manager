import {
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { Entity } from "@/schemas/entity.schema";
import { EntityType as CustomEntityType } from "@/schemas/entity-type.schema";

@Injectable()
export class EntitiesService {
  constructor(
    @InjectModel(Entity.name)
    private entityModel: Model<Entity>,
    @InjectModel(CustomEntityType.name)
    private entityTypeModel: Model<CustomEntityType>,
  ) {}

  async findOne(id: string): Promise<Entity> {
    const entity = await this.entityModel.findOne({
      _id: new Types.ObjectId(id),
      isActive: true,
    });

    if (!entity) {
      throw new NotFoundException('ENTITY.NOT_FOUND');
    }

    // Populate customEntityTypeId if type is custom
    if (entity.type === "custom" && entity.customEntityTypeId) {
      const customEntityType = await this.entityTypeModel.findById(
        entity.customEntityTypeId,
      );
      return {
        ...entity.toObject(),
        customEntityType: customEntityType
          ? {
              _id: customEntityType._id,
              title: customEntityType.title,
              color: customEntityType.color,
            }
          : null,
      } as Entity;
    }

    return entity;
  }
}
