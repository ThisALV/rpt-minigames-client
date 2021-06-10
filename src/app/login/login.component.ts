import { Component, OnInit } from '@angular/core';
import { LoginService } from '../login.service';


/**
 * Provides an input field to modify the `LoginService` current name.
 *
 * @author ThisALV, https://github.com/ThisALV/
 */
@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnInit {
  constructor(public readonly loginData: LoginService) {}

  ngOnInit(): void {}
}
