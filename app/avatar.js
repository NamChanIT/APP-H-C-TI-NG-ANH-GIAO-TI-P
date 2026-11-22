import TalkingPortrait from './talking-portrait';

export default function Avatar({ character, miniature = false, speaking, speechMotion }) {
  if (!miniature) return <TalkingPortrait speaking={speaking} speechMotion={speechMotion} />;
  return <div aria-hidden="true" className={`avatar ${character.id} ${miniature ? 'miniature' : ''}`}
    style={{ '--skin': character.skin, '--hair': character.hair, '--shirt': character.shirt, '--scene': character.background }}>
    <div className="avatar-art">
      <div className="portrait-head">
        <i className="hair-back" /><i className="neck" /><i className="ear left" /><i className="ear right" />
        <div className="face">
          <i className="brow left" /><i className="brow right" />
          <i className="eye left" /><i className="eye right" />
          <i className="nose" /><i className="blush left" /><i className="blush right" />
          <i className="mouth" />
        </div>
        <i className="fringe" /><i className="hair-side" />
      </div>
      <i className="torso" /><i className="collar" />
    </div>
  </div>;
}
