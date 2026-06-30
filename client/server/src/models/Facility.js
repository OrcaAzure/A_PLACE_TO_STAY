export default class Facility {
  constructor(data) {
    this.id             = data.id;
    this.name           = data.name;
    this.room_code      = data.room_code;
    this.description    = data.description;
    this.package_name   = data.package_name;
    this.facility_group = data.facility_group;
    this.capacity_min   = data.capacity_min;
    this.capacity_max   = data.capacity_max;
    this.created_at     = data.created_at;
    this.updated_at     = data.updated_at;
  }
}
