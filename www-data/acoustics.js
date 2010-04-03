goog.require('goog.dom');
goog.require('goog.net.XhrIo');
goog.require('goog.ui.TableSorter');
goog.require('goog.ui.Slider');
goog.require('goog.ui.Component');
goog.require('goog.Throttle');
goog.require('goog.Timer');
goog.require('goog.async.Delay');

playlist_pane = 0;
vc_modifiable = false;
currentUser = '';
rem_time = 0;
jsonSource = '/acoustics/json.pl';

function readableTime(length)
{
	if (length < 0) {length = 0;}
	var seconds = length % 60;
	var minutes = Math.floor(length / 60) % 60;
	var hours = Math.floor(length / 3600);
	if (hours) {
		return sprintf("%d:%02d:%02d",hours,minutes,seconds);
	} else {
		return sprintf("%d:%02d",minutes,seconds);
	}
}

function sendPlayerCommand(mode) {
	if (!currentUser) {
		alert("You must log in first.");
		return;
	}
	goog.net.XhrIo.send(
			jsonSource + '?mode=' + mode,
			function () {handlePlayerStateRequest(this.getResponseJson());}
	);
}

function setVolume(value) {
	if (!currentUser) {
		alert("You must log in first.");
		return;
	}
	goog.net.XhrIo.send(
			jsonSource + '?mode=volume;value=' + value,
			function () {handlePlayerStateRequest(this.getResponseJson());}
	);
}

function searchRequest(field, value)
{
	if (field == "stats"){
		statsRequest(value);
	} else if (field == "playlist") {
		playlistRequest(value);
	} else if (field == "history") {
		loadPlayHistory(25, value);
	} else {
		goog.net.XhrIo.send(
				jsonSource + '?mode=search;field='+field+';value='+value,
				function () {
					goog.dom.$('result_title').innerHTML = 'Search for "' + value + '" in ' + field;
					fillResultTable(this.getResponseJson());
					showVoting();
				}
		);
	}
}

function selectRequest(field, value)
{
	goog.net.XhrIo.send(
			jsonSource + '?mode=select;field='+field+';value='+value,
			function () {
				goog.dom.$('result_title').innerHTML = 'Select on ' + field;
				fillResultTable(this.getResponseJson());
				showVoting();
			}
	);
}

function startPlayingTimer() {
	var tim = new goog.Timer(1000);
	tim.start();
	goog.events.listen(tim, goog.Timer.TICK, function () {updatePlayingTime();});
}

function statsRequest(who)
{
	this.songIDs = [];
	goog.net.XhrIo.send(
			jsonSource+'?mode=stats;who='+who,
			function() {
				goog.dom.$('result_title').innerHTML = 'A bit of statistics for ' + (who === '' ? "everyone" : who) + "...";
				fillStatsTable(this.getResponseJson());
				hideVoting();
			}
	);
}

function updatePlayingTime()
{
	if(rem_time > 0) {
		goog.dom.$('playingTime').innerHTML = readableTime(--rem_time);
	}
}

function startPlayerStateTimer () {
	playerStateRequest();
	var timer = new goog.Timer(15000);
	timer.start();
	goog.events.listen(timer, goog.Timer.TICK, function () {playerStateRequest();});
}

function playerStateRequest () {
	goog.net.XhrIo.send(
		jsonSource,
		function () {handlePlayerStateRequest(this.getResponseJson());}
	);
}

function handlePlayerStateRequest (json) {
	if (json.who) {
		updateCurrentUser(json.who);
	}

	// skip link
	if (json.can_skip) {
		goog.dom.$('skip_link').style.visibility = 'visible';
	} else {
		goog.dom.$('skip_link').style.visibility = 'hidden';
	}
	// Admin Dequeue
	if (json.is_admin) {
		goog.dom.$('purgeuser').style.visibility = 'visible';
	} else {
		goog.dom.$('purgeuser').style.visibility = 'hidden';
	}

	updateNowPlaying(json.now_playing, json.player);
	if (json.player) {
		updateVolumeScale(json.player.volume);
	}
	if (json.playlist && playlist_pane === 0) {
		updatePlaylist(json.playlist);
	}
}

function updateCurrentUser (who) {
	if (who) {
		// update the playlist selector on the first time we have a valid user
		if (!currentUser) {
			updatePlaylistSelector(who);
		}
		currentUser = who;
		goog.dom.$('loginbox').innerHTML = 'welcome ' + who;
	} else {
		goog.dom.$('loginbox').innerHTML = '<a href="www-data/auth">Log in</a>';
	}
}

function updatePlaylist(json)
{
	var totalTime = 0;
	list = '<ul>';
	var dropdown = [];
	for (var item in json)
	{
		list += '<li>';
		if (json[item].who && json[item].who.indexOf(currentUser) != -1) {
			list += '<a title="Remove your vote for this" href="javascript:unvoteSong('
				+ json[item].song_id
				+ ')"><img src="www-data/icons/delete.png" alt="unvote" /></a> '
				+ ' <a title="Vote To Top" href="javascript:voteToTop('
				+ json[item].song_id
				+ ')"><img src="www-data/icons/lightning_go.png" '
				+ 'alt="vote to top" /></a> ';
		} else {
			list += '<a title="Vote for this" href="javascript:voteSong('
				+ json[item].song_id
				+ ')"><img src="www-data/icons/add.png" alt="vote" /></a> ';
		}
		title = titleOrPath(json[item]);
		list += '<a title="See who voted for this" '
			+ 'href="javascript:getSongDetails('
			+ qsencode(json[item].song_id) + ')">' + title
			+ '</a> by <a href="javascript:selectRequest(\'artist\', \''
			+ qsencode(json[item].artist) + '\')">' + json[item].artist
			+ '</a>&nbsp;('
			+ readableTime(json[item].length) +') ('+json[item].who.length+')</li>';
		totalTime = totalTime + parseInt(json[item].length);
		var voters = [];
		for (var voter in json[item].who)
		{
			var index = json[item].who[voter];
			if (dropdown.indexOf(index) == -1)
			{
				dropdown.push(index);
			}
		}
	}
	list += '</ul>';
	list += 'Total Time: '+readableTime(totalTime);
	goog.dom.$('playlist').innerHTML = list;
	fillPurgeDropDown(dropdown);
}

function fillPurgeDropDown(options)
{
	var purgelist = goog.dom.$('user');
	purgelist.options.length = 0;
	purgelist.options.add(new Option("Pick one",''));
	for (var i in options)
	{
		purgelist.options.add(new Option(options[i],options[i]));
	}
}

function updatePlaylistSelector(who) {
	if (who) {
		goog.net.XhrIo.send(
				jsonSource + '?mode=playlists;who='+who,
				function() {
				var json = this.getResponseJson();
				var selector = goog.dom.$('playlistchooser');
				selector.options.length = 0;
				selector.options.add(new Option('Queue', 0));
				selector.options.add(new Option('New playlist...', -1));
				selector.options.add(new Option('---', 0));
				for (var i in json) {
				selector.options.add(
					new Option(json[i].title, json[i].playlist_id)
					);
				}
				}
				);
	}
}

function selectPlaylist(playlist) {
	if (playlist == -1) { // make a new playlist
		var title = prompt(
			"Name your playlist!",
			"experiment " + Math.floor(Math.random()*10000)
		);
		if (title) {
			goog.net.XhrIo.send(
					jsonSource + '?mode=create_playlist;title=' + title,
					function() {
					//var json = this.getResponseJson();
					updatePlaylistSelector(currentUser);
					}
					);
		} else {
			updatePlaylistSelector(currentUser);
		}
	} else if (playlist !== 0) { // show a playlist
		playerStateRequest();
		goog.net.XhrIo.send(
			jsonSource + '?mode=playlist_contents;playlist_id=' + playlist,
			function() {
				playlist_pane = playlist;
				goog.dom.$('playlist_action').innerHTML = '<a href="javascript:enqueuePlaylist()"><img src="www-data/icons/add.png" alt="" /> enqueue playlist</a> <br /> <a href="javascript:enqueuePlaylistShuffled(10)"><img src="www-data/icons/sport_8ball.png" alt="" /> enqueue 10 random songs</a>';
				goog.dom.$('playlist_remove').innerHTML = '<a href="javascript:deletePlaylist()"><img src="www-data/icons/bomb.png" alt="" /> delete playlist</a>';
				showPlaylist(this.getResponseJson());
			}
		);
	} else { // show the queue
		playlist_pane = 0;
		playerStateRequest();
		goog.dom.$('playlist_action').innerHTML = '<a href="javascript:shuffleVotes()"><img src="www-data/icons/sport_8ball.png" alt="" /> shuffle my votes</a>';
		goog.dom.$('playlist_remove').innerHTML = '<a href="javascript:purgeSongs(currentUser)"><img src="www-data/icons/disconnect.png" alt="" /> clear my votes</a>';
	}
}

function playlistRequest (who) {
	goog.net.XhrIo.send(
		jsonSource + '?mode=playlists;who=' + who,
		function() {
			hideVoting();
			goog.dom.$('result_title').innerHTML = (who === "" ? "All" : who + "'s") + " playlists";
			var json = this.getResponseJson();
			var list = "<ul>";
			for (var i in json) {
				list += '<li><a href="javascript:playlistTableRequest('
					+ json[i].playlist_id + ',' + "\'" + json[i].title + "\'" + ')">' + json[i].title + '</a> by '
					+ json[i].who + '</li>';
			}
			list += "</ul>";
			goog.dom.$('songresults').innerHTML = list;
		}
	);
}

function playlistTableRequest(playlist_id,title,who) {
	goog.net.XhrIo.send(
		jsonSource + '?mode=playlist_contents;playlist_id=' + playlist_id,
		function() {
			showVoting();
			goog.dom.$('result_title').innerHTML = 'Contents of playlist "' + title + '"';
			fillResultTable(this.getResponseJson());
		}
	);
}

function deletePlaylist () {
	var answer = confirm("Really delete this playlist?");
	if (answer) {
		goog.net.XhrIo.send(
			jsonSource + '?mode=delete_playlist;playlist_id=' + playlist_pane,
			function() {
				updatePlaylistSelector(currentUser);
				selectPlaylist(0);
			}
		);
	}
}

function enqueuePlaylistShuffled (amount) {
	if (playlist_pane !== 0) {
		goog.net.XhrIo.send(
			jsonSource + '?mode=playlist_contents;playlist_id=' + playlist_pane,
			function() {
				var json = shuffle(this.getResponseJson());
				var block = "";
				for (var i = 0; i < json.length && i < amount; i++) {
					block += "song_id=" + json[i].song_id + ";";
				}
				if (block != ""){
					goog.net.XhrIo.send(
							jsonSource + '?mode=vote;' + block,
							function() {handlePlayerStateRequest(this.getResponseJson());}
					);
				}
			}
		);
	} else {
		alert('should not happen (enqueuePlaylistShuffled)!');
	}

}

function enqueuePlaylist () {
	if (playlist_pane !== 0) {
		goog.net.XhrIo.send(
			jsonSource + '?mode=playlist_contents;playlist_id=' + playlist_pane,
			function() {
				var json = this.getResponseJson();
				var block = "";
				for (var i in json) {
					block += "song_id=" + json[i].song_id + ";";
				}
				if (block != ""){
					goog.net.XhrIo.send(
							jsonSource + '?mode=vote;' + block,
							function() {handlePlayerStateRequest(this.getResponseJson());}
					);
				}
				// go back to the queue
				goog.dom.$('playlistchooser').selectedIndex = 0;
				selectPlaylist(0);
			}
		);
	} else {
		alert('should not happen (enqueuePlaylist)!');
	}
}

function showPlaylist(json) {
	var totalTime = 0;
	var list = '<ul>';
	for (var item in json) {
		title = titleOrPath(json[item]);
		list += '<li>'
			+ '<a title="Remove from your playlist" href="javascript:unvoteSong('
			+ json[item].song_id
			+ ')"><img src="www-data/icons/delete.png" alt="unvote" /></a> '
			+ '<a title="View Song Details" href="javascript:getSongDetails('
			+ qsencode(json[item].song_id) + ')">' + title
			+ '</a> by <a href="javascript:selectRequest(\'artist\', \''
			+ qsencode(json[item].artist) + '\')">' + json[item].artist
			+ '</a>&nbsp;(' + readableTime(json[item].length) +')';
		totalTime += parseInt(json[item].length);
	}
	list += '</ul>';
	list += 'Total Time: '+readableTime(totalTime);
	goog.dom.$('playlist').innerHTML = list;
}

function updateNowPlaying(json, player) {
	if (json) {
		nowPlaying = '';
		if (json.who && json.who.indexOf(currentUser) != -1 && playlist_pane === 0) {
			nowPlaying += '<a href="javascript:unvoteSong(' + json.song_id
				+ ')"><img src="www-data/icons/delete.png" alt="unvote" /></a> ';
		} else {
			nowPlaying += '<a href="javascript:voteSong(' + json.song_id
				+ ')"><img src="www-data/icons/add.png" alt="vote" /></a> ';
		}
		title = titleOrPath(json);
		nowPlaying += '<a href="javascript:getSongDetails('+json.song_id+')">' + title
			+ '</a> by <a href="javascript:selectRequest(\'artist\', \''
			+ qsencode(json.artist) + '\')">' + json.artist + '</a>';
		if (json.album) {
			nowPlaying += ' (from <a href="javascript:selectRequest(\'album\', \''
				+ qsencode(json.album) + '\')">' + json.album + '</a>)';
		}
		nowPlaying += '&nbsp;('+readableTime(json.length)+')';
		rem_time = parseInt(player.song_start) + parseInt(json.length) - Math.round(((new Date().getTime())/1000));
		if (rem_time < 0) {
			rem_time = 0;
		}
		nowPlaying += '&nbsp;(<span id="playingTime">'+readableTime(rem_time)+'</span> remaining)';
	} else {
		nowPlaying = 'nothing playing';
	}
	goog.dom.$('currentsong').innerHTML = nowPlaying;
}

function lastLinkSong(artist, title)
{
	return '<a href="http://last.fm/music/'+artist+'/_/'+title+'" target="_new"><img class="icon" src="www-data/icons/as.png"></a>';
}

function lastLinkAlbum(artist, album)
{
	return '<a href="http://last.fm/music/'+artist+'/'+album+'" target="_new"><img class="icon" src="www-data/icons/as.png"></a>';
}

function lastLinkArtist(artist)
{
	return '<a href="http://last.fm/music/'+artist+'" target="_new"><img class="icon" src="www-data/icons/as.png"></a>';
}

function wikiLinkArtist(artist)
{
	return '<a href="http://en.wikipedia.org/wiki/'+artist+'_(band)" target="_new"><img class="icon" src="www-data/icons/wiki.png"></a>';
}

function wikiLinkAlbum(album)
{
	return '<a href="http://en.wikipedia.org/wiki/'+album+'_(album)" target="_new"><img class="icon" src="www-data/icons/wiki.png"></a>';
}

function wikiLinkSong(title)
{
	return '<a href="http://en.wikipedia.org/wiki/'+title+'_(song)" target="_new"><img class="icon" src="www-data/icons/wiki.png"></a>';
}

function loadPlayHistory(amount, who) {
	goog.net.XhrIo.send(
		jsonSource + '?mode=history;amount='+amount+';who='+who,
		function() {
			var text = amount + ' previously played songs';
			if (who) {text += ' by ' + who;}
			goog.dom.$('result_title').innerHTML = text;
			// TODO: make me mighty
			fillResultTable(this.getResponseJson());
			showVoting();
		}
	);
}

function loadRecentSongs(amount) {
	goog.net.XhrIo.send(
		jsonSource + '?mode=recent;amount=' + amount,
		function () {
			goog.dom.$('result_title').innerHTML = amount + ' Recently Added Songs';
			fillResultTable(this.getResponseJson());
			showVoting();
		}
	);
}

function loadRandomSongs(amount) {
	goog.net.XhrIo.send(
		jsonSource + '?mode=random;amount=' + amount,
		function () {
			goog.dom.$('result_title').innerHTML = amount + ' Random Songs';
			fillResultTable(this.getResponseJson());
			showVoting();
		}
	);
}

function loadVotesFromVoter(voter){
	goog.net.XhrIo.send(
		jsonSource + '?mode=byvoter;voter=' + voter,
		function(){
			goog.dom.$('result_title').innerHTML = voter + "'s Songs";
			fillResultTable(this.getResponseJson());
			goog.dom.$('userstats').innerHTML = '<a href="javascript:statsRequest(\'' + voter + '\')">' + voter + '\'s stats</a>';
			showVoting();
		}
	);
}

function browseSongs(field)
{
	goog.net.XhrIo.send(
			jsonSource + '?mode=browse;field=' + field,
			function () {
				goog.dom.$('result_title').innerHTML = 'Browse by ' + field;
				fillResultList(this.getResponseJson(), field);
			}
	);
}

function getSongDetails(song_id) {
	this.songIDs = [song_id];
	goog.net.XhrIo.send(
		jsonSource + '?mode=get_details;song_id='+song_id,
		function() {
			var json = this.getResponseJson().song;
			var table = '<table id="result_table"><thead><tr><th>Vote</th>'
				+ '<th>Track</th><th>Title</th><th>Album</th><th>Artist</th>'
				+ '<th>Length</th></tr></thead><tbody>'
				+ '<tr><td style="text-align: center"><a href="javascript:voteSong('
				+ json.song_id + ')"><img src="www-data/icons/add.png" alt="vote" />'
				+ '</a></td><td>' + json.track + '</td><td>'
				+ '<a href="javascript:selectRequest(\'title\', \''
				+ qsencode(json.title) + '\')">' + json.title + '</a>'+lastLinkSong(json.artist, json.title)+wikiLinkSong(json.title)+'</td><td>'
				+ '<a href="javascript:selectRequest(\'album\', \''
				+ qsencode(json.album) + '\')">' + json.album + '</a>'+lastLinkAlbum(json.artist, json.album)+wikiLinkAlbum(json.album)+'</td><td>'
				+ '<a href="javascript:selectRequest(\'artist\', \''
				+ qsencode(json.artist) + '\')">' + json.artist + '</a>'+lastLinkArtist(json.artist)+wikiLinkArtist(json.artist)+'</td><td>'
				+ readableTime(json.length) + '</td></tr>'
				+ '<tr><th colspan=2>Path:</th><td colspan=4>'
				+ json.path + '</td></tr>'
				+ '<tr><th colspan=2>Voters:</th><td colspan=4>';
			if (json.who.length) {
				for(var who in json.who) {table += '<a href=javascript:loadVotesFromVoter("' + json.who[who] + '")>' + json.who[who] + '</a>&nbsp;';}
			} else {
				table += 'no one';
			}
			table += "</td></tr></tbody></table>";
			goog.dom.$('songresults').innerHTML = table;
			goog.dom.$('result_title').innerHTML = "Details for this song";
			hideVoting();
		}
	);
}

function fillResultList(json, field) {
	list = '<ul>';
	for (var item in json) {
		list += '<li><a href="javascript:selectRequest(\'' + field
			+ '\',\'' + qsencode(json[item]) + '\')">'
			+ json[item] + '</a></li>';
	}
	list += '</ul>';
	goog.dom.$('songresults').innerHTML = list;
}

function fillHistoryTable(json) {
	this.songIDs = [];
	var table = '<table id="result_table"><thead><tr><th>Vote</th><th>Name</th><th>Played at</th></tr></thead>';
	for (var item in json)
	{
		table += '<tr><td style="text-align: center">'
		+		 '<a href="javascript:voteSong('+json[item].song_id+')"><img src="www-data/icons/add.png" alt=""/></a>'
		+		 '</td><td><a href="javascript:getSongDetails('+json[item].song_id+')">'+json[item].pretty_name+'</a></td><td>'+json[item].time+'</td></tr>';
		this.songIDs.push(json[item].song_id);
	}
	table += '</table>';
	goog.dom.$('songresults').innerHTML = table;
}

function fillStatsTable(json) {
	table = '<table id="result_table">'
			+'<tr><th>Total Songs</th><td>'+json.total_songs+'</td></tr>'
			+'<tr><th colspan=2>Most Played Artists:</th></tr>';
			for(var item in json.top_artists)
			{
				table += '<tr><td>'+'<a href="javascript:selectRequest(\'artist\',\'' + json.top_artists[item].artist +'\')">' + json.top_artists[item].artist + '</a></td><td>'+json.top_artists[item].count+'</td></tr>';
			}
			table +='</table>';
	goog.dom.$('songresults').innerHTML = table;
	goog.dom.$('userstats').innerHTML = "";
}

function fillResultTable(json) {
	this.songIDs = [];
	table = '<table id="result_table"><thead><tr><th>vote</th>'
		+  '<th>Track</th>'
		+  '<th>Title</th>'
		+  '<th>Album</th>'
		+  '<th>Artist</th><th>Length</th></tr></thead><tbody>';
	for (var item in json) {
		title = titleOrPath(json[item]);
		table += '<tr>'
		+ '<td style="text-align: center"><a href="javascript:voteSong('
		+ json[item].song_id
		+ ')"><img src="www-data/icons/add.png" alt="vote" /></a></td>'
		+ '<td>' + json[item].track + '</td>'
		+ '<td class="datacol"><a href="javascript:getSongDetails('
		+ json[item].song_id + ')">' + title + '</a></td>'
		+ '<td class="datacol"><a href="javascript:selectRequest(\'album\', \''
		+ qsencode(json[item].album) + '\')">' + json[item].album + '</a></td>'
		+ '<td class="datacol"><a href="javascript:selectRequest(\'artist\', \''
		+ qsencode(json[item].artist) + '\')">' + json[item].artist + '</a></td>'
		+ '<td>'+readableTime(json[item].length)+'</td>'
		+ '</tr>';
		this.songIDs.push(json[item].song_id);
	}
	table += '</tbody></table>';
	goog.dom.$('songresults').innerHTML = table;

	var component = new goog.ui.TableSorter();
	component.decorate(goog.dom.$('result_table'));
	component.setDefaultSortFunction(goog.ui.TableSorter.alphaSort);
	component.setSortFunction(1, goog.ui.TableSorter.numericSort);
}

function voteSong(song_id) {
	if (!currentUser) {
		alert("You must log in first.");
		return;
	}
	if (playlist_pane !== 0) {
		goog.net.XhrIo.send(
			jsonSource + '?mode=add_to_playlist;playlist_id='
			+ playlist_pane + ';song_id=' + song_id,
			function () {showPlaylist(this.getResponseJson());}
		);
	} else {
		goog.net.XhrIo.send(
			jsonSource + '?mode=vote;song_id=' + song_id,
			function () {handlePlayerStateRequest(this.getResponseJson());}
		);
	}
}

function unvoteSong(song_id) {
	if (!currentUser) {
		alert("You must log in first.");
		return;
	}
	if (playlist_pane !== 0) {
		goog.net.XhrIo.send(
			jsonSource + '?mode=remove_from_playlist;playlist_id='
			+ playlist_pane + ';song_id=' + song_id,
			function () {showPlaylist(this.getResponseJson());}
		);
	} else {
		goog.net.XhrIo.send(
			jsonSource + '?mode=unvote;song_id=' + song_id,
			function () {handlePlayerStateRequest(this.getResponseJson());}
		);
	}
}

function shuffleVotes() {
	if (!currentUser) {
		alert("You must log in first.");
		return;
	}
	goog.net.XhrIo.send(
			jsonSource + '?mode=shuffle_votes',
			function () {handlePlayerStateRequest(this.getResponseJson());}
	);
}

function voteToTop(song_id) {
	if (!currentUser) {
		alert("You must log in first.");
		return;
	}
	goog.net.XhrIo.send(
			jsonSource + '?mode=vote_to_top;song_id=' + song_id,
			function () {handlePlayerStateRequest(this.getResponseJson());}
	);
}

function purgeSongs(user) {
	goog.net.XhrIo.send(
		jsonSource + '?mode=purge;who=' + user,
		function () {
			handlePlayerStateRequest(this.getResponseJson());
		}
	);
}

function updateVolumeScale(volume) {
	scale = '';
	for (var i = 1; i <= 11; i++) {
		scale += '<a ';
		if (Math.round(volume / 10)+1 == i) {scale += 'style="color: red" ';}
		scale += 'href="javascript:setVolume(' + ((i * 10) - 10) + ')">' + i + '</a> ';
	}
	goog.dom.$('volume').innerHTML = scale;
}

function qsencode(str) {
	str = str.replace(/\\/, '\\\\');
	str = str.replace(/\'/, '\\\'');
	str = str.replace(/\"/, '\\\"');
	str = str.replace('&', '%2526');
	str = str.replace('+', '%252B');
	str = str.replace('#', '%2523');
	return str;
}

function formencode(str) {
	str = str.replace('&', '%26');
	str = str.replace('+', '%2B');
	str = str.replace('#', '%23');
	return str;
}

function titleOrPath(json) {
	if(json.player) {updateVolumeScale(json.player.volume);}
	if (json.title) {
		return json.title;
	}
	else {
		var shortname = /^.*\/(.*)$/.exec(json.path);
		if (shortname) {
			return shortname[1];
		}
		else {
			return json.path;
		}
	}
}

function voteRandom() {
	var possible = this.songIDs.length;
	if (possible <= 0) {
		return;
	}
	var randomSong = this.songIDs[Math.floor(Math.random()*possible)];
	goog.net.XhrIo.send(
		jsonSource + '?mode=vote;song_id=' + randomSong,
		function() {handlePlayerStateRequest(this.getResponseJson());}
	);
}
// ALL THE POWAR!
function voteAll() {
	var block = "";
	for (var i in this.songIDs) {
		block += "song_id=" + this.songIDs[i] + ";";
	}
	if (block != ""){
		var command = "?mode=vote;";
		if (playlist_pane) {
			command = "?mode=add_to_playlist;playlist_id=" + playlist_pane + ";";
		}
		goog.net.XhrIo.send(
				jsonSource + command + block,
				function() {
					if (playlist_pane) {showPlaylist(this.getResponseJson());}
					else {handlePlayerStateRequest(this.getResponseJson());}
				}
		);
	}
}
function hideVoting() {
	goog.dom.$('voterand').style.visibility = "hidden";
	goog.dom.$('voteall').style.visibility = "hidden";
}
function showVoting() {
	goog.dom.$('voterand').style.visibility = "visible";
	goog.dom.$('voteall').style.visibility = "visible";
}

function shuffle(array) {
	var tmp, current, top = array.length;

	if(top) {
		while(--top) {
			current = Math.floor(Math.random() * (top + 1));
			tmp = array[current];
			array[current] = array[top];
			array[top] = tmp;
		}
	}

	return array;
}
