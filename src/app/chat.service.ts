import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { Message } from './message';
import { BadSerCommand, CommandParser, SerProtocolService, SerService } from 'rpt-webapp-client';


/**
 * Sends and receives message to and from other actors registered into server.
 *
 * @author ThisALV, https://github.com/ThisALV/
 */
@Injectable({
  providedIn: 'root'
})
export class ChatService extends SerService {
  private readonly messages: Subject<Message>;

  /**
   * Listens for every message received by ChatService on SER Protocol.
   *
   * @param serProtocol Protocol to received Service commands on
   */
  constructor(serProtocol: SerProtocolService) {
    super(serProtocol, 'Chat');

    this.messages = new Subject<Message>();

    // Listen for every message received from actors
    this.serviceSubject.subscribe({
      next: (chatCommand: string) => this.handleCommand(chatCommand)
    });
  }

  private handleCommand(chatCommand: string): void {
    // Parses command
    const parsedCommand = new CommandParser(chatCommand).parseTo([{ name: 'command', type: String }]);

    // Primitive-value convertion required as CommandParsed call new()
    if (String(parsedCommand) !== 'MESSAGE_FROM') { // The only available Service command for Chat is MESSAGE_FROM to receive a message
      throw new BadSerCommand('Only MESSAGE_FROM is known for Chat');
    }

    // Parses message author: UID for actor who wrote this message
    const parsedMessage = parsedCommand.parseTo([{ name: 'author', type: Number }]);

    // The first argument met is the actor UID, then come the message
    this.messages.next(new Message(parsedMessage.parsedData.author, parsedMessage.unparsed));
  }

  /**
   * @param message Text content for message to send to other actors inside chat room
   */
  send(message: string): void {
    this.serviceSubject.next(message);
  }

  /**
   * @returns Observable for every `Message` sent by an actor
   */
  getMessages(): Observable<Message> {
    return this.messages;
  }
}
