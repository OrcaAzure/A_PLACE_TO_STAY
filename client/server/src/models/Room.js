export default class Room {
  constructor(data) {
    this.id = data.id;
    this.room_number = data.room_number;
    this.room_type = data.room_type;
    this.capacity = data.capacity;
    this.occupancy = data.occupancy;
    this.price = data.price;
    this.status = data.status;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }
}