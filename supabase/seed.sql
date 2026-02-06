-- Dummy data from ut_hackathon_dummy_data.sql

INSERT INTO public."EXCAVATOR_TYPE" ("TYPE") VALUES
('PC-2000'),
('PC-1250');

INSERT INTO public."DUMP_TRUCK_TYPE" ("TYPE", "TURNING_RADIUS") VALUES
('HD-785', 10),
('HD-465', 8);

INSERT INTO public."VIDEO_ANALITYC" ("FILE_NAME", "BENCH_HEIGHT", "FRONT_LOADING_AREA_LENGTH", "DIGGING_TIME", "SWINGING_TIME", "DUMPING_TIME", "LOADING_TIME", "ANALITYC_TYPE", "LOCATION", "OPERATOR", "AVG_CYCLETIME") VALUES
('cycle_video_001.mp4', NULL, NULL, 45.5, 32.3, 28.7, 180.2, 'CYCLE_TIME_ANALITYC', 'Pit A - North', 'John Doe', 286.7),
('cycle_video_002.mp4', NULL, NULL, 48.2, 35.1, 30.5, 195.4, 'CYCLE_TIME_ANALITYC', 'Pit A - South', 'Jane Smith', 309.2),
('cycle_video_003.mp4', NULL, NULL, 42.8, 30.5, 26.3, 175.8, 'CYCLE_TIME_ANALITYC', 'Pit B - East', 'Mike Johnson', 275.4),
('cycle_video_004.mp4', NULL, NULL, 50.3, 38.2, 32.1, 205.6, 'CYCLE_TIME_ANALITYC', 'Pit B - West', 'Sarah Williams', 326.2),
('cycle_video_005.mp4', NULL, NULL, 44.7, 33.8, 29.2, 188.3, 'CYCLE_TIME_ANALITYC', 'Pit C - Central', 'Robert Brown', 296.0),
('cycle_video_006.mp4', NULL, NULL, 46.9, 34.5, 30.8, 192.7, 'CYCLE_TIME_ANALITYC', 'Pit A - North', 'Emily Davis', 304.9),
('cycle_video_007.mp4', NULL, NULL, 43.5, 31.7, 27.5, 182.4, 'CYCLE_TIME_ANALITYC', 'Pit D - South', 'David Wilson', 285.1),
('cycle_video_008.mp4', NULL, NULL, 49.1, 36.8, 31.4, 198.5, 'CYCLE_TIME_ANALITYC', 'Pit A - East', 'Lisa Anderson', 315.8),
('cycle_video_009.mp4', NULL, NULL, 41.2, 29.8, 25.9, 172.3, 'CYCLE_TIME_ANALITYC', 'Pit B - North', 'Tom Martinez', 269.2),
('cycle_video_010.mp4', NULL, NULL, 47.6, 35.9, 30.1, 194.8, 'CYCLE_TIME_ANALITYC', 'Pit C - West', 'Amy Taylor', 308.4);

INSERT INTO public."VIDEO_ANALITYC" ("FILE_NAME", "BENCH_HEIGHT", "FRONT_LOADING_AREA_LENGTH", "DIGGING_TIME", "SWINGING_TIME", "DUMPING_TIME", "LOADING_TIME", "ANALITYC_TYPE", "LOCATION", "OPERATOR", "AVG_CYCLETIME") VALUES
('bench_video_001.mp4', 8.5, NULL, NULL, NULL, NULL, NULL, 'BENCH_HEIGHT_MESUREMENT', 'Pit A - North', 'John Doe', NULL),
('bench_video_002.mp4', 7.8, NULL, NULL, NULL, NULL, NULL, 'BENCH_HEIGHT_MESUREMENT', 'Pit A - South', 'Jane Smith', NULL),
('bench_video_003.mp4', 9.2, NULL, NULL, NULL, NULL, NULL, 'BENCH_HEIGHT_MESUREMENT', 'Pit B - East', 'Mike Johnson', NULL),
('bench_video_004.mp4', 8.1, NULL, NULL, NULL, NULL, NULL, 'BENCH_HEIGHT_MESUREMENT', 'Pit B - West', 'Sarah Williams', NULL),
('bench_video_005.mp4', 7.5, NULL, NULL, NULL, NULL, NULL, 'BENCH_HEIGHT_MESUREMENT', 'Pit C - Central', 'Robert Brown', NULL),
('bench_video_006.mp4', 8.9, NULL, NULL, NULL, NULL, NULL, 'BENCH_HEIGHT_MESUREMENT', 'Pit A - North', 'Emily Davis', NULL),
('bench_video_007.mp4', 7.2, NULL, NULL, NULL, NULL, NULL, 'BENCH_HEIGHT_MESUREMENT', 'Pit D - South', 'David Wilson', NULL),
('bench_video_008.mp4', 9.5, NULL, NULL, NULL, NULL, NULL, 'BENCH_HEIGHT_MESUREMENT', 'Pit A - East', 'Lisa Anderson', NULL),
('bench_video_009.mp4', 8.3, NULL, NULL, NULL, NULL, NULL, 'BENCH_HEIGHT_MESUREMENT', 'Pit B - North', 'Tom Martinez', NULL),
('bench_video_010.mp4', 7.9, NULL, NULL, NULL, NULL, NULL, 'BENCH_HEIGHT_MESUREMENT', 'Pit C - West', 'Amy Taylor', NULL);

INSERT INTO public."VIDEO_ANALITYC" ("FILE_NAME", "BENCH_HEIGHT", "FRONT_LOADING_AREA_LENGTH", "DIGGING_TIME", "SWINGING_TIME", "DUMPING_TIME", "LOADING_TIME", "ANALITYC_TYPE", "LOCATION", "OPERATOR", "AVG_CYCLETIME") VALUES
('front_video_001.mp4', NULL, 25.5, NULL, NULL, NULL, NULL, 'FRONT_LOADING_MESUREMENT', 'Pit A - North', 'John Doe', NULL),
('front_video_002.mp4', NULL, 28.3, NULL, NULL, NULL, NULL, 'FRONT_LOADING_MESUREMENT', 'Pit A - South', 'Jane Smith', NULL),
('front_video_003.mp4', NULL, 23.7, NULL, NULL, NULL, NULL, 'FRONT_LOADING_MESUREMENT', 'Pit B - East', 'Mike Johnson', NULL),
('front_video_004.mp4', NULL, 26.9, NULL, NULL, NULL, NULL, 'FRONT_LOADING_MESUREMENT', 'Pit B - West', 'Sarah Williams', NULL),
('front_video_005.mp4', NULL, 24.2, NULL, NULL, NULL, NULL, 'FRONT_LOADING_MESUREMENT', 'Pit C - Central', 'Robert Brown', NULL),
('front_video_006.mp4', NULL, 27.8, NULL, NULL, NULL, NULL, 'FRONT_LOADING_MESUREMENT', 'Pit A - North', 'Emily Davis', NULL),
('front_video_007.mp4', NULL, 22.5, NULL, NULL, NULL, NULL, 'FRONT_LOADING_MESUREMENT', 'Pit D - South', 'David Wilson', NULL),
('front_video_008.mp4', NULL, 29.1, NULL, NULL, NULL, NULL, 'FRONT_LOADING_MESUREMENT', 'Pit A - East', 'Lisa Anderson', NULL),
('front_video_009.mp4', NULL, 25.8, NULL, NULL, NULL, NULL, 'FRONT_LOADING_MESUREMENT', 'Pit B - North', 'Tom Martinez', NULL),
('front_video_010.mp4', NULL, 26.4, NULL, NULL, NULL, NULL, 'FRONT_LOADING_MESUREMENT', 'Pit C - West', 'Amy Taylor', NULL);

INSERT INTO public."EXCAVATOR_DATA" ("EXCAVATOR_TYPE_FK", "VIDEO_ANALITYC_FK") VALUES
(1, 1),
(2, 2),
(1, 3),
(2, 4),
(1, 5),
(2, 6),
(1, 7),
(2, 8),
(1, 9),
(2, 10);

INSERT INTO public."DUMP_TRUCK_DATA" ("VIDEO_ANALITYC_FK", "DUMP_TRUCK_TYPE_FK", "QUEUE_TIME", "ESTIMATED_LOAD") VALUES
(1, 1, 15.5, 25.3),
(2, 2, 18.2, 24.8),
(3, 1, 12.8, 26.1),
(4, 2, 20.3, 23.9),
(5, 1, 14.7, 25.7),
(6, 2, 16.9, 24.5),
(7, 1, 13.5, 26.3),
(8, 2, 19.1, 24.2),
(9, 1, 11.2, 27.1),
(10, 2, 17.6, 25.0);
