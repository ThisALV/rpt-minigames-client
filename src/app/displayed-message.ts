import { ActorsNameService } from './actors-name.service';
import { Message } from './message';


/**
 * Data for a message valid when it was posted. That is, an object of this type doesn't contain the author UID, but rather its name, as
 * its entry inside the names DB might be removed later. This avoid problems when trying to display a message with a logged out author.
 */
export class DisplayedMessage {
  /**
   * Author name.
   */
  readonly author: string;

  /**
   * Content of the message.
   */
  readonly content: string;

  /**
   * @param namesProvider DB to obtain name associated with `msg.uid` from
   * @param msg Provides UID to obtain name and provides message content.
   *
   * @throws nameFor() throws
   */
  constructor(namesProvider: ActorsNameService, msg: Message) {
    this.author = namesProvider.nameFor(msg.author);
    this.content = msg.content;
  }
}
