export default class User {
  constructor(userData) {
    this.id = userData.id;
    this.name = userData.name;
    this.email = userData.email;
    this.role = userData.role;
  }
}