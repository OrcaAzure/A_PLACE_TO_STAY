import { formatRoomTypeLabel } from '../constants/rooms.js';

export default class Room {
  constructor(data) {
    this.id            = data.id;
    this.building_id   = data.building_id;
    this.building_name = data.building_name || null; // populated by JOIN queries
    this.room_number   = data.room_number;
    this.room_type     = data.room_type;
    this.bed_count     = data.bed_count != null ? Number(data.bed_count) : null;
    this.room_type_label = formatRoomTypeLabel(this);
    this.capacity_min  = data.capacity_min;
    this.capacity_max  = data.capacity_max;
    this.occupancy     = data.occupancy;
    this.status        = data.status;
    this.created_at    = data.created_at;
    this.updated_at    = data.updated_at;
  }
}