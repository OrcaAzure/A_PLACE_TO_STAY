export default class Booking {
  constructor(data) {
    this.id             = data.id;
    this.user_id        = data.user_id;
    this.room_id        = data.room_id;
    this.check_in       = data.check_in;
    this.check_out      = data.check_out;
    this.season         = data.season;
    this.occupancy_item = data.occupancy_item;
    this.guest_count    = data.guest_count;
    this.total_amount   = data.total_amount;
    this.status         = data.status;
    this.notes          = data.notes;
    this.created_at     = data.created_at;
    this.updated_at     = data.updated_at;
  }
}