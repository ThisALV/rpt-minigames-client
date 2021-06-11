import { Injectable } from '@angular/core';


// Upper limit for an actor UID
const MAX_UID = 2 ** 64 - 1;


/**
 * Provides data required to register client: actor name and UID.
 *
 * @author ThisALV, https://github.com/ThisALV/
 */
@Injectable({
  providedIn: 'root'
})
export class LoginService {
  name: string;

  /**
   * Constructs service providing an empty name.
   */
  constructor() {
    this.name = '';
  }

  /**
   * @returns A random 64bits unsigned integer, compatible with an actor UID
   */
  generateUid(): number {
    return Math.floor(Math.random() * MAX_UID);
  }
}
