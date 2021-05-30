import { Subject } from 'rxjs';


/**
 * Used to assign an Observable callback that should NOT be called
 */
export function unexpected(): void {
  fail('Unexpected Observable state');
}


/**
 * Checks for the 2 given arrays to have the same size and to contain the same elements in the exact same order.
 *
 * @param a1 compared with `a2`
 * @param a2 compared with `a1`
 */
export function expectArrayToBeEqual<T>(a1: T[], ...a2: T[]): void {
  // For 2 arrays to be equal element by element, they must have the same size
  expect(a1).toHaveSize(a2.length);

  // Then checks element by element, as we're sure a1.length === a2.length
  for (let i = 0; i < a2.length; i++) {
    expect(a1[i]).toEqual(a2[i]);
  }
}


/**
 * Mocks any subject which is using next() method to send a message and next() callback to receive a message (for example, a
 * `WebSocketSubject<string>`)
 */
export class MockedMessagingSubject extends Subject<string> {
  /**
   * Every `next()` method arguments stored here.
   */
  sentMessagesQueue: string[];

  /**
   * Constructs subject with no sent messages.
   */
  constructor() {
    super();
    this.sentMessagesQueue = [];
  }

  /**
   * Re-open subject after it has been closed by error() or complete(), has no effect if it is already open.
   */
  open(): void {
    this.isStopped = false;
  }

  /**
   * Clear `sendMessagesQueue`, will be empty after this call.
   */
  clear(): void {
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
