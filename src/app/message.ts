/**
 * Data of a received message, with author actor UID and message textual content.
 */
export class Message {
  constructor(readonly author: number, readonly content: string) {}
}
