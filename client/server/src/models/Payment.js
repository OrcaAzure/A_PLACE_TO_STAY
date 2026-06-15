// To Be fixed at a later time

export default class Payment {
  constructor(data) {
    this.id         = data.id;
    this.booking_id = data.booking_id;
    this.amount     = data.amount;
    this.method     = data.method;
    this.status     = data.status;
    this.paid_at    = data.paid_at;  // timestamp when payment was confirmed
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }
}