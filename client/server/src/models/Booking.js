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
    this.contact_phone   = data.contact_phone || null;
    this.meal_allergen_notes = data.meal_allergen_notes || null;
    this.meals           = data.meals || [];
    this.fees            = data.fees || [];
    this.created_at     = data.created_at;
    this.updated_at     = data.updated_at;
    this.guest_name    = data.guest_name;
    this.guest_email  = data.guest_email;
    this.guest_role   = data.guest_role;
    this.room_number   = data.room_number;
    this.room_type     = data.room_type;
    this.building_name = data.building_name;
  }
}