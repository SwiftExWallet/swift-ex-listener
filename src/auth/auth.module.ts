import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from './jwt-auth.guard';

@Module({
  imports: [
    // registerAsync, not register. register() is evaluated the moment this file
    // is imported, and app.module.ts imports AuthModule before its own
    // ConfigModule.forRoot() has populated process.env — so the old
    // `process.env.JWT_SECRET || 'NA'` always resolved to the literal 'NA' in
    // production. Verified against the deployed box: a token signed with "NA"
    // was accepted, one signed with the real secret was rejected.
    // The factory runs after config is loaded; getOrThrow makes a missing
    // secret fail at boot rather than silently degrading to a guessable one.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '1d' },
      }),
    }),
  ],
  providers: [AuthService, JwtAuthGuard],
  controllers: [AuthController],
  exports: [AuthService, JwtAuthGuard, JwtModule],
})
export class AuthModule {}
