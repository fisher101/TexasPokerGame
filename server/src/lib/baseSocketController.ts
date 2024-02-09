import { Controller } from 'egg';
import { IGameRoom, IRoomInfo } from '../interface/IGameRoom';
import { IPlayer } from '../app/core/Player';
import { AdapterType, Online, OnlineAction } from '../utils/constant';
import * as FR from '../service/fullRecord';

export default class BaseSocketController extends Controller {
  public app = this.ctx.app as any;
  public nsp = this.app.io.of('/socket');
  public gameRooms = this.nsp.gameRooms;
  public socket = this.ctx.socket as any;
  public query = this.socket.handshake.query;
  public roomNumber = this.query.room;
  public jwt: any = this.app.jwt;
  public message = this.ctx.args[0] || {};

  protected async getUserInfo() {
    const { token } = this.query;
    const user: IPlayer = this.jwt.verify(token) && this.jwt.verify(token).user;
    return user;
  }

  protected getRoomInfo(): IRoomInfo {
    const { room } = this.query;
    const roomInfo = this.gameRooms.find((gr: IGameRoom) => gr.number === room);
    return roomInfo.roomInfo;
  }

  protected adapter(type: AdapterType, actionName: OnlineAction, data: any) {
    this.nsp.adapter.clients([this.roomNumber], (err: any, clients: any) => {
      this.nsp.to(this.roomNumber).emit(type, {
        clients,
        action: actionName,
        target: 'participator',
        data,
      });
    });
  }

  /**
   * 记录操作
   * @param action 如 check, raise:10
   * @returns
   */
  protected updateFullRecord(action: string) {
    const roomInfo = this.getRoomInfo();
    if (FR.fullRecord.players.length === 0) {
      roomInfo.sit.map((sit) => {
        const userId = sit.player?.userId;
        const player = roomInfo.game?.allPlayer.find((p) => p.userId === userId);
        const mirrorPlayer = roomInfo.players.find((p) => p.userId === userId);
        if (!userId || !player || !mirrorPlayer) return;

        FR.fullRecord.players.push({
          userId,
          nickName: player.nickName,
          position: String(player.position), // to fix
          handCard: player.getFormattedHandCard(false),
          buyIn: mirrorPlayer?.buyIn,
          counter: player?.counter,
        });
      });
    }

    if (!roomInfo.game) return;
    const [command, size] = action.split(':');
    FR.fullRecord.actions.push({
      userId: roomInfo.game.currPlayer.node.userId,
      commonCard: [...roomInfo.game.commonCard],
      time: new Date().toISOString(),
      command,
      size: size ? Number(size) : undefined,
    });
  }

  protected saveFullRecordAndClean(roomNumber: string) {
    FR.saveFullRecordAndClean(this.app.getLogger('fullRecordLogger'), { roomNumber });
  }

  protected updateGameInfo() {
    const roomInfo = this.getRoomInfo();
    console.log(roomInfo, 'roomInfo ===============================');
    if (
      (roomInfo.game && roomInfo.game.status < 6) ||
      (roomInfo.game?.status === 6 && roomInfo.game.playerSize === 1)
    ) {
      roomInfo.players.forEach((p) => {
        const currPlayer = roomInfo.game && roomInfo.game.getPlayers().find((player) => player.userId === p.userId);
        p.counter = currPlayer?.counter || p.counter;
        p.type = currPlayer?.type || '';
        p.status = currPlayer ? 1 : p.status === -1 ? -1 : 0;
        p.actionCommand = (currPlayer && currPlayer.actionCommand) || '';
        p.delayCount = (currPlayer && currPlayer.delayCount) || 0;
        p.actionSize = (currPlayer && currPlayer.actionSize) || 0;
        p.gameCount = currPlayer?.gameCount || p.gameCount;
        p.voluntaryActionCountAtPreFlop = currPlayer?.voluntaryActionCountAtPreFlop || p.voluntaryActionCountAtPreFlop;
        p.actionCountAtPreFlop = currPlayer?.actionCountAtPreFlop || p.actionCountAtPreFlop;
        p.walksCountAtPreFlop = currPlayer?.walksCountAtPreFlop || p.walksCountAtPreFlop;
        p.winCountAtPreFlop = currPlayer?.winCountAtPreFlop || p.winCountAtPreFlop;
        p.raiseCountAtPreFlop = currPlayer?.raiseCountAtPreFlop || p.raiseCountAtPreFlop;
      });
      console.log(roomInfo.players, 'roomInfo.players ===============================333');
      const gameInfo = {
        players: roomInfo.players.map((p) => {
          const currPlayer = roomInfo.game?.allPlayer.find((player) => player.userId === p.userId);
          return Object.assign(
            {},
            {
              counter: currPlayer?.counter || p.counter,
              actionSize: currPlayer?.actionSize || 0,
              actionCommand: currPlayer?.actionCommand || '',
              nickName: p.nickName,
              type: currPlayer?.type || '',
              status: p.status || 0,
              userId: p.userId,
              buyIn: p.buyIn || 0,
              delayCount: currPlayer?.delayCount || 0,
              gameCount: currPlayer?.gameCount || p.gameCount,
              voluntaryActionCountAtPreFlop:
                currPlayer?.voluntaryActionCountAtPreFlop || p.voluntaryActionCountAtPreFlop,
              actionCountAtPreFlop: currPlayer?.actionCountAtPreFlop || p.actionCountAtPreFlop,
              walksCountAtPreFlop: currPlayer?.walksCountAtPreFlop || p.walksCountAtPreFlop,
              winCountAtPreFlop: currPlayer?.winCountAtPreFlop || p.winCountAtPreFlop,
              raiseCountAtPreFlop: currPlayer?.raiseCountAtPreFlop || p.raiseCountAtPreFlop,
            },
            {},
          );
        }),
        pot: roomInfo.game.pot,
        prevSize: roomInfo.game.prevSize,
        sitList: roomInfo.sit,
        actionEndTime: roomInfo.game.actionEndTime,
        currPlayer: {
          userId: roomInfo.game.currPlayer.node.userId,
        },
        smallBlind: roomInfo.config.smallBlind,
      };
      console.log('gameInfo ==========', gameInfo);
      this.adapter(Online, OnlineAction.GameInfo, gameInfo);
    }
  }
}
