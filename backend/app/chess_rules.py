"""Standard chess rules; no analysis engine is exposed for live games."""
import json
from .chess_vendor import Game

def san_move(game, uci):
    legal = game.get_moves()
    if uci not in legal:
        raise ValueError('Geçersiz hamle.')
    start, end = uci[:2], uci[2:4]
    piece = game.board.get_piece(Game.xy2i(start))
    target = game.board.get_piece(Game.xy2i(end))
    capture = target != ' ' or (piece.lower() == 'p' and start[0] != end[0])
    if piece.lower() == 'k' and abs(ord(start[0])-ord(end[0])) == 2:
        san = 'O-O' if end[0] == 'g' else 'O-O-O'
    elif piece.lower() == 'p':
        san = (start[0]+'x' if capture else '')+end
    else:
        others = [m[:2] for m in legal if m[2:4] == end and m[:2] != start and game.board.get_piece(Game.xy2i(m[:2])) == piece]
        dis = ''
        if others:
            dis = start[0] if all(s[0] != start[0] for s in others) else start[1] if all(s[1] != start[1] for s in others) else start
        san = piece.upper()+dis+('x' if capture else '')+end
    if len(uci) == 5:
        san += '='+uci[4].upper()
    game.apply_move(uci)
    san += '#' if game.status == Game.CHECKMATE else '+' if game.status == Game.CHECK else ''
    return san

def insufficient(game, color=None):
    pieces = [(i, game.board.get_piece(i)) for i in range(64) if game.board.get_piece(i) != ' ']
    nonking = [(i,p) for i,p in pieces if p.lower() != 'k']
    if color:
        own = [(i,p) for i,p in nonking if p.isupper() == (color=='w')]
        enemy = [(i,p) for i,p in nonking if p.isupper() != (color=='w')]
        if not own:
            return True
        if len(own)==1 and own[0][1].lower()=='n' and not enemy:
            return True
        if all(p.lower()=='b' for _,p in nonking):
            return len({(i//8+i%8)%2 for i,_ in nonking}) == 1
        return False
    if len(nonking) <= 1:
        return not nonking or nonking[0][1].lower() in 'bn'
    return all(p.lower()=='b' for _,p in nonking) and len({(i//8+i%8)%2 for i,_ in nonking}) == 1

def position_key(game):
    fields = str(game).split()
    # A nominal en-passant square matters only when capture is legal.
    if fields[3] != '-' and not any(m[2:4]==fields[3] and m[0]!=m[2] and game.board.get_piece(Game.xy2i(m[:2])).lower()=='p' for m in game.get_moves()):
        fields[3] = '-'
    return ' '.join(fields[:4])

def repetitions(match):
    game=Game(); key=position_key(Game(match.fen)); count=int(position_key(game)==key)
    for item in json.loads(match.moves):
        game.apply_move(item['uci']);count+=int(position_key(game)==key)
    return count

def automatic_result(match, game):
    status=game.status
    if status == Game.CHECKMATE:
        return ('0-1' if game.state.player=='w' else '1-0', 'checkmate')
    if status == Game.STALEMATE:return ('1/2-1/2','stalemate')
    if insufficient(game):return ('1/2-1/2','insufficient_material')
    if int(game.state.ply)>=150:return ('1/2-1/2','seventy_five_moves')
    if repetitions(match)>=5:return ('1/2-1/2','fivefold_repetition')
    return None

def bot_move(game):
    # Bounded one-ply training opponent, deliberately separate from rated play.
    values={'p':100,'n':320,'b':330,'r':500,'q':900,'k':0}
    ranked=[]
    for move in game.get_moves():
        trial=Game(str(game));san_move(trial,move)
        score=0
        for i in range(64):
            p=trial.board.get_piece(i)
            if p!=' ':score+=values[p.lower()]*(1 if p.islower() else -1)
        if trial.status==Game.CHECKMATE:score=100000
        # Small preference for central squares, deterministic tie breaking.
        score+=3*(3.5-abs(ord(move[2])-ord('d')))+2*(3.5-abs(int(move[3])-4))
        ranked.append((score,move))
    return max(ranked)[1] if ranked else None

def pgn(match, white, black):
    clean=lambda s:str(s).replace('\\','\\\\').replace('"','\\"').replace('\n',' ').replace('\r',' ')
    tags={'Event':'Lidya Satranç','Site':'LidyaChat','Date':match.created_at.strftime('%Y.%m.%d'),'White':white,'Black':black,'Result':match.result,'TimeControl':'-' if match.mode=='bot' else str(match.white_ms//1000)+'+'+str(match.increment_ms//1000)}
    # Use original preset, never remaining clock.
    if match.mode!='bot':tags['TimeControl']=str(int(match.preset.split('+')[0])*60)+'+'+match.preset.split('+')[1]
    moves=json.loads(match.moves)
    body=' '.join((str(i//2+1)+'. ' if i%2==0 else '')+m['san'] for i,m in enumerate(moves))
    return '\n'.join('['+k+' "'+clean(v)+'"]' for k,v in tags.items())+'\n\n'+body+' '+match.result+'\n'
