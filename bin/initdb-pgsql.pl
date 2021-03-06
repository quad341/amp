#!/usr/bin/env perl

use strict;
use warnings;
use lib ($0 =~ m{(.+/)?})[0] . '../lib';
use Acoustics;

my $ac = Acoustics->new({
	config_file => ($0 =~ m{(.+)/})[0] . '/../conf/acoustics.ini',
});
my $db = $ac->db;

$db->do("DROP TABLE IF EXISTS songs");
$db->do("DROP TABLE IF EXISTS votes");
$db->do("DROP TABLE IF EXISTS history");
$db->do("DROP TABLE IF EXISTS players");

$db->do("CREATE TABLE songs (song_id SERIAL, path
    VARCHAR(1024) NOT NULL, artist VARCHAR(256), album VARCHAR(256), title
    VARCHAR(256), length BIGINT NOT NULL, track BIGINT, online
    SMALLINT, PRIMARY KEY (song_id))");

$db->do("CREATE TABLE votes (song_id BIGINT, who VARCHAR(256), player_id
    VARCHAR(256), time TIMESTAMP, priority INT, UNIQUE(song_id, who))");

$db->do("CREATE TABLE history (song_id BIGINT, time TIMESTAMP, who
    VARCHAR(256), player_id VARCHAR(256))");

$db->do("CREATE TABLE players (player_id VARCHAR(256), volume BIGINT,
    song_id BIGINT, song_start BIGINT, local_id VARCHAR(256),
    remote_id VARCHAR(256), queue_hint TEXT, PRIMARY KEY(player_id))");
