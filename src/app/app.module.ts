import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { ServersListComponent } from './servers-list/servers-list.component';
import { LoginComponent } from './login/login.component';
import { FormsModule } from '@angular/forms';
import { RuntimeErrorsComponent } from './runtime-errors/runtime-errors.component';


@NgModule({
  declarations: [
    AppComponent,
    ServersListComponent,
    LoginComponent,
    RuntimeErrorsComponent
  ],
    imports: [
        BrowserModule,
        AppRoutingModule,
        FormsModule
    ],
  providers: [
    { provide: Window, useValue: window }
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
