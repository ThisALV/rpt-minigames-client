import { Subject } from 'rxjs';


/**
 * Used to assign an Observable callback that should NOT be called
 */
export function unexpected(): void {
  fail('Unexpected Observable state');
}


/**
 * Mocks any subject which is using next() method to send a message and next() callback to receive a message (for example, a
 * `WebSocketSubject<string>`)
 */
export class MockedMessagingSubject extends Subject<string> {
  /**
   * Every `next()` method arguments stored here.
   */
  readonly sentMessagesQueue: string[];

  /**
   * Constructs subject with no sent messages.
   */
  constructor() {
    super();
    this.sentMessagesQueue = [];
  }

  /**
   * @param message Will be pushed into `sentMessagesQueue`, must *NOT* be `undefined`
   */
  next(message?: string): void {
    this.sentMessagesQueue.push(message as string);
  }

  /**
   * @param message `next()` observers callback will be called using that value
   */
  receive(message: string): void {
    super.next(message);
  }
}
