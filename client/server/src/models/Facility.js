export default class Facility {
  constructor(data) {
    this.id           = data.id;
    this.category     = data.category;
    this.item         = data.item;
    this.season       = data.season;
    this.rate         = data.rate != null ? Number(data.rate) : null;
    this.capacity_min = data.capacity_min;
    this.capacity_max = data.capacity_max;
    this.created_at   = data.created_at;
    this.updated_at   = data.updated_at;
  }
}
