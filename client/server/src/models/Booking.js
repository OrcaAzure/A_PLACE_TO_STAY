export default class Booking {
  constructor(data) {
    this.id = data.id;
    this.user_id = data.user_id;
    this.room_id = data.room_id;
    this.check_in = data.check_in;
    this.check_out = data.check_out;
    this.status = data.status;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }
}