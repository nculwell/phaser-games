// vim: et ts=8 sts=4 sw=4

// Screen dimensions and layout
const sidebarSize = { w: 100, h: 600 }
const playArea = {
    x: sidebarSize.w,
    y: 0,
    w: 800,
    h: 600,
};
playArea.left = playArea.x;
playArea.right = playArea.x + playArea.w;
playArea.center = {
    x: Math.floor(playArea.x + playArea.w/2),
    y: Math.floor(playArea.y + playArea.h/2),
};

const config = {
    type: Phaser.AUTO,
    width: 1000,
    height: 600,
    controlWidthL: 100,
    controlWidthR: 100,
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 300 },
            debug: false
        }
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    },
    scale: {
        parent: "game",
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        min: {
            width: 1000,
            height: 600,
        },
        zoom: 1,
    },
};

const game = new Phaser.Game(config);

let player;
let stars;
let bombs;
let platforms;
let cursors;
let score = 0;
let gameOver = false;
let scoreText;
let dpad;
let buttons;

function preload ()
{
    this.load.image('sky', 'assets/sky.png');
    this.load.image('ground', 'assets/platform.png');
    this.load.image('star', 'assets/star.png');
    this.load.image('bomb', 'assets/bomb.png');
    this.load.image('sidebar', '../shared/assets/sidebar_100x600.png');
    this.load.image('dpad', '../shared/assets/gamepad-overlay-dpad-colors.png');
    this.load.image('buttons', '../shared/assets/gamepad-overlay-buttons.png');
    this.load.spritesheet('dude', 'assets/dude.png', { frameWidth: 32, frameHeight: 48 });

    this.load.audio('bomb_hit', 'assets/sound/bomb_hit.wav')
    this.load.audio('bomb_bounce', 'assets/sound/bomb_bounce.wav')
    this.load.audio('star_bounce', 'assets/sound/star_bounce.wav')
    this.load.audio('star_grab', 'assets/sound/star_grab.wav')
}

function create ()
{

    //  A simple background for our game
    this.add.image(playArea.center.x, playArea.center.y, 'sky');

    //  The platforms group contains the ground and the 2 ledges we can jump on
    platforms = this.physics.add.staticGroup();

    //  Here we create the ground.
    //  Scale it to fit the width of the game (the original sprite is 400x32 in size)
    const platSize = { w: 400, h: 32 };
    platforms
        .create(playArea.center.x, config.height-platSize.h, 'ground')
        .setScale(config.width/platSize.w)
        .refreshBody();

    //  Now let's create some ledges (bottom to top)
    platforms.create(playArea.left + 600, 400, 'ground');
    platforms.create(playArea.left + 50, 250, 'ground');
    platforms.create(playArea.left + 750, 220, 'ground');

    // Sidebars
    // (these aren't really platforms but it's useful to add them here)
    //const sidebars = this.physics.add.staticGroup();
    const sidebars = platforms;
    const sidebarCenterX = Math.floor(sidebarSize.w / 2);
    sidebars.create(sidebarCenterX, config.height/2, 'sidebar');
    sidebars.create(config.width - sidebarCenterX, config.height/2, 'sidebar');

    // The player and its settings
    player = this.physics.add.sprite(playArea.left + 100, 450, 'dude');

    //  Player physics properties. Give the little guy a slight bounce.
    player.setBounce(0.2);
    player.setCollideWorldBounds(true);

    //  Our player animations, turning, walking left and walking right.
    this.anims.create({
        key: 'left',
        frames: this.anims.generateFrameNumbers('dude', { start: 0, end: 3 }),
        frameRate: 10,
        repeat: -1
    });

    this.anims.create({
        key: 'turn',
        frames: [ { key: 'dude', frame: 4 } ],
        frameRate: 20
    });

    this.anims.create({
        key: 'right',
        frames: this.anims.generateFrameNumbers('dude', { start: 5, end: 8 }),
        frameRate: 10,
        repeat: -1
    });

    // On-screen controls
    dpad = this.add.image(50, config.height-50, 'dpad');
    buttons = this.add.image(config.width - 50, config.height-50, 'buttons');
    if (!dpad.getLocalPoint)
        dpad.getLocalPoint = polyfillGetLocalPoint(dpad);
    if (!buttons.getLocalPoint)
        buttons.getLocalPoint = polyfillGetLocalPoint(buttons);

    //  Input Events
    cursors = this.input.keyboard.createCursorKeys();
    this.input.addPointer(3); // 4-touch

    // Fullscreen
    dpad.setInteractive().on('pointerdown', () => {
        this.scale.lockOrientation("landscape");
        this.scale.startFullscreen();
    });

    //  Some stars to collect, 12 in total, evenly spaced 70 pixels apart along the x axis
    stars = this.physics.add.group({
        key: 'star',
        repeat: 11,
        setXY: { x: playArea.left + 12, y: 0, stepX: 70 }
    });

    stars.children.iterate(function (child) {
        //  Give each star a slightly different bounce
        child.setBounceY(Phaser.Math.FloatBetween(0.4, 0.8));
    });

    bombs = this.physics.add.group();

    //  The score
    scoreText = this.add.text(playArea.left + 16, 16, 'score: 0', { fontSize: '32px', fill: '#000' });

    //  Collide the player and the stars with the platforms
    this.physics.add.collider(player, platforms, playerLand, null, this);
    this.physics.add.collider(stars, platforms, starBounce, null, this);
    this.physics.add.collider(bombs, platforms, bombBounce, null, this);

    //  Checks to see if the player overlaps with any of the stars, if he does call the collectStar function
    this.physics.add.overlap(player, stars, collectStar, null, this);

    this.physics.add.collider(player, bombs, hitBomb, null, this);
}

function update ()
{
    if (gameOver)
    {
        return;
    }

    let move = null;
    let jump = false;

    if (cursors.left.isDown)
    {
        move = "left";
    }
    else if (cursors.right.isDown)
    {
        move = "right";
    }

    if (cursors.up.isDown)
    {
        jump = true;
    }

    const boundLft = Math.floor(config.width*.30);
    const boundRgt = Math.floor(config.width*.70);
    const boundTop = Math.floor(config.height*.50);

    const pointers = [
        this.input.activePointer,
        this.input.pointer1,
        this.input.pointer2,
        this.input.pointer3,
        this.input.pointer4,
    ];
    for (const pointer of pointers)
    {
        if (pointer.isDown) {
            const touchX = pointer.x;
            const touchY = pointer.y;
            if (dpad.getBounds().contains(touchX, touchY)) {
                // identify dpad direction
                const point = dpad.getLocalPoint(touchX, touchY);
                const pixel = this.textures.getPixel(point.x, point.y, 'dpad');
                if (pixel.r == 255 && pixel.g == 0 && pixel.b == 0)
                    jump = true;
                else if (pixel.r == 0 && pixel.g == 255 && pixel.b == 0)
                    move = "right";
                else if (pixel.r == 0 && pixel.g == 0 && pixel.b == 255)
                    ; // down arrow does nothing
                else if (pixel.r == 255 && pixel.g == 255 && pixel.b == 0)
                    move = "left";
            } else if (buttons.getBounds().contains(touchX, touchY)) {
                // identify button among buttons
                const point = buttons.getLocalPoint(touchX, touchY);
                const pixel = this.textures.getPixel(point.x, point.y, 'buttons');
                if (pixel.r > 0)
                    jump = true;
                else if (pixel.r == 0 && pixel.g == 0 && pixel.b > 0)
                    jump = true;
            }
            /*
            if (touchX < boundLft)
                move = "left";
            else if (touchX > boundRgt)
                move = "right";
            if (true // touchY < boundTop
                && touchX > boundLft
                && touchX < boundRgt)
            {
                jump = true;
            }
            */
        }
    }

    if (move == "left")
    {
        player.setVelocityX(-160);
        player.anims.play('left', true);
    }
    else if (move == "right")
    {
        player.setVelocityX(160);
        player.anims.play('right', true);
    }
    else
    {
        player.setVelocityX(0);
        player.anims.play('turn');
    }

    if (jump && player.body.touching.down)
    {
        player.setVelocityY(-330);
    }

}

function collectStar (player, star)
{
    star.disableBody(true, true);

    //  Add and update the score
    score += 10;
    scoreText.setText('Score: ' + score);

    const sound = this.sound.add('star_grab');
    sound.play();

    if (stars.countActive(true) === 0)
        nextLevel();
}

function nextLevel()
{
    //  A new batch of stars to collect
    stars.children.iterate(function (child) {
        child.enableBody(true, child.x, 0, true, true);
    });

    var x = (player.x < playArea.center.x)
        ? Phaser.Math.Between(playArea.center.x, playArea.right)
        : Phaser.Math.Between(playArea.left, playArea.center.x);

    var bomb = bombs.create(x, 16, 'bomb');
    bomb.setBounce(1);
    bomb.setCollideWorldBounds(true);
    bomb.setVelocity(Phaser.Math.Between(-200, 200), 20);
    bomb.allowGravity = false;
}

function hitBomb(player, bomb)
{
    this.physics.pause();
    player.setTint(0xff0000);
    player.anims.play('turn');
    gameOver = true;
    const sound = this.sound.add('bomb_hit');
    sound.play();
}

function bombBounce(star, platform) {
    const sound = this.sound.add('bomb_bounce');
    sound.play();
}

function starBounce(star, platform) {
    const vSpeed = Math.abs(star.body.velocity.y);
    if (vSpeed > 20) {
        const sound = this.sound.add('star_bounce');
        sound.play();
    }
}

function playerLand(star, platform) {
    // TODO: play sound
}

function polyfillGetLocalPoint(object) {
    return (ptX, ptY) => {
        const tl = object.getTopLeft();
        return {
            x: (ptX - tl.x),
            y: (ptY - tl.y)
        };
    }
}

