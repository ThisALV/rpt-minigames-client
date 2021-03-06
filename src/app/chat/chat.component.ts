import { Component, OnDestroy, OnInit } from '@angular/core';
import { RptlProtocolService } from 'rpt-webapp-client';
import { ChatService } from '../chat.service';
import { Subscription } from 'rxjs';
import { ActorsNameService } from '../actors-name.service';
import { Message } from '../message';
import { DisplayedMessage } from '../displayed-message';


/**
 * When RPTL state is registered, displays received messages and provides an input area to send message to server.
 *
 * @author ThisALV, https://github.com/ThisALV/
 */
@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css']
})
export class ChatComponent implements OnInit, OnDestroy {
  /**
   * Every messages received since current component lifecycle.
   */
  messages: DisplayedMessage[];

  /**
   * Message which will be sent and reset to empty at `sendCurrentMessage()` call.
   */
  currentMessage: string;

  private messagesSubscription?: Subscription; // When registered, subscription for listened ChatServer messages

  constructor(
    private readonly namesProvider: ActorsNameService,
    private readonly appStateProvider: RptlProtocolService,
    private readonly chat: ChatService
  ) {
    this.messages = [];
    this.currentMessage = '';
  }

  /**
   * Sends chat message stored inside `currentMessage` and resets it.
   */
  sendCurrentMessage(): void {
    this.chat.send(this.currentMessage);
    this.currentMessage = '';
  }

  /**
   * Resets chat messages and listen for chat messages emitted by underlying SER Service chat.
   */
  ngOnInit(): void {
    this.messages = []; // Resets received chat messages for the new lifecycle which corresponds to a new server aka a new chat room
    this.currentMessage = ''; // Resets user inputted text

    this.messagesSubscription = this.chat.getMessages().subscribe({ // Waits for a Chat message to be received
      next: (msg: Message) => this.messages.push(new DisplayedMessage(this.namesProvider, msg))
    });
  }

  /**
   * Stops listening for RPTL state registered inside server and for new Chat messages.
   */
  ngOnDestroy(): void {
    this.messagesSubscription?.unsubscribe();
  }
}
