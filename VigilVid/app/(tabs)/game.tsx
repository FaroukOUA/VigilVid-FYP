import Feather from "@expo/vector-icons/Feather";
import { useEvent } from "expo";
import * as Haptics from "expo-haptics";
import { Tabs, useFocusEffect } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { colors, radius, spacing } from "../../constants/theme";
import { type GameAnswer, type SoloGameItem } from "../../data/game";
import { useAuth } from "../../hooks/use-auth";
import {
  type SoloGameResult,
  useSoloGameProgress,
} from "../../hooks/use-solo-game-progress";
import { usePublicGameSamples } from "../../hooks/use-public-game-samples";
import { submitGameScore } from "../../lib/api";

const roundScore = 100;
const streakBonus = 20;

type ScoreSyncStatus = "idle" | "syncing" | "synced" | "skipped" | "failed";
type FeatherIconName = keyof typeof Feather.glyphMap;
type GameScreenMode = "solo" | "machine";
type MachineRevealStatus = "checking" | "idle" | "revealed";
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function GameScreen() {
  const gameSamples = usePublicGameSamples();
  const [activeItems, setActiveItems] = useState<SoloGameItem[] | null>(null);
  const [selectedMode, setSelectedMode] = useState<GameScreenMode | null>(null);
  const refreshGameSamples = gameSamples.refresh;

  useFocusEffect(
    useCallback(() => {
      if (selectedMode === null) {
        refreshGameSamples();
      }
    }, [refreshGameSamples, selectedMode]),
  );

  const handleSelectMode = (mode: GameScreenMode) => {
    if (gameSamples.status === "loading") {
      return;
    }

    setActiveItems(gameSamples.items);
    setSelectedMode(mode);
  };

  const handleBackToModes = () => {
    setActiveItems(null);
    setSelectedMode(null);
  };

  const screenTitle =
    selectedMode === "solo"
      ? "Solo mode"
      : selectedMode === "machine"
        ? "You vs VigilVid"
        : "Real or Fake";
  const content =
    selectedMode === "solo" ? (
      <SoloModeScreen
        gameItems={activeItems ?? gameSamples.items}
      />
    ) : selectedMode === "machine" ? (
      <ManVsMachineModeScreen
        gameItems={activeItems ?? gameSamples.items}
      />
    ) : (
      <GameModeMenu gameSamples={gameSamples} onSelectMode={handleSelectMode} />
    );

  return (
    <>
      <Tabs.Screen
        options={{
          headerLeft:
            selectedMode === null
              ? undefined
              : () => <HeaderModeBackButton onPress={handleBackToModes} />,
          title: screenTitle,
        }}
      />
      {content}
    </>
  );
}

function HeaderModeBackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel="Back to game modes"
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={styles.headerBackButton}
    >
      <Feather color={colors.surface} name="arrow-left" size={20} />
    </Pressable>
  );
}

function SoloModeScreen({
  gameItems,
}: {
  gameItems: SoloGameItem[];
}) {
  const { session, user } = useAuth();
  const {
    errorMessage,
    isLoading: isProgressLoading,
    progress,
    recordGameResult,
  } = useSoloGameProgress();
  const [correctCount, setCorrectCount] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [roundIndex, setRoundIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [scoreSyncMessage, setScoreSyncMessage] = useState("");
  const [scoreSyncStatus, setScoreSyncStatus] =
    useState<ScoreSyncStatus>("idle");
  const [selectedAnswer, setSelectedAnswer] = useState<GameAnswer | null>(null);
  const [streak, setStreak] = useState(0);
  const [topStreakThisRun, setTopStreakThisRun] = useState(0);

  const currentItem = gameItems[roundIndex];
  const totalRounds = gameItems.length;
  const hasAnswered = selectedAnswer !== null;
  const accuracy = getAccuracyPercent(correctCount, totalRounds);

  const resultSummary = useMemo(
    () => ({
      correctCount,
      score,
      streak: topStreakThisRun,
      totalRounds,
    }),
    [correctCount, score, topStreakThisRun, totalRounds],
  );

  const handleAnswerPress = (answer: GameAnswer) => {
    if (hasAnswered || isComplete) {
      return;
    }

    const answerIsCorrect = answer === currentItem.correctAnswer;
    const nextStreak = answerIsCorrect ? streak + 1 : 0;
    const nextCorrectCount = answerIsCorrect ? correctCount + 1 : correctCount;
    const nextScore = answerIsCorrect
      ? score + roundScore + streak * streakBonus
      : score;

    setSelectedAnswer(answer);
    setStreak(nextStreak);
    setTopStreakThisRun((currentTopStreak) =>
      Math.max(currentTopStreak, nextStreak),
    );
    setCorrectCount(nextCorrectCount);
    setScore(nextScore);

    void Haptics.notificationAsync(
      answerIsCorrect
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Warning,
    );
  };

  const syncGameScore = async (summary: SoloGameResult) => {
    const accessToken = session?.access_token;
    if (!accessToken || !user) {
      setScoreSyncStatus("skipped");
      setScoreSyncMessage(
        "Sign in to save future game scores to your account.",
      );
      return;
    }

    setScoreSyncStatus("syncing");
    setScoreSyncMessage("Saving score to your account.");

    try {
      await submitGameScore(
        {
          bestStreak: summary.streak,
          correctCount: summary.correctCount,
          mode: "solo",
          roundIds: gameItems.map((item) => item.id),
          score: summary.score,
          totalRounds: summary.totalRounds,
        },
        accessToken,
      );
      setScoreSyncStatus("synced");
      setScoreSyncMessage(
        "Score saved to your account for future game progress.",
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not save score to your account right now.";
      setScoreSyncStatus("failed");
      setScoreSyncMessage(`${message} Your score is still saved on this phone.`);
    }
  };

  const handleNextPress = () => {
    if (!hasAnswered) {
      return;
    }

    if (roundIndex < totalRounds - 1) {
      setRoundIndex((currentRoundIndex) => currentRoundIndex + 1);
      setSelectedAnswer(null);
      return;
    }

    setIsComplete(true);
    void recordGameResult(resultSummary);
    void syncGameScore(resultSummary);
  };

  const handleRestartPress = () => {
    setCorrectCount(0);
    setIsComplete(false);
    setRoundIndex(0);
    setScore(0);
    setSelectedAnswer(null);
    setStreak(0);
    setScoreSyncMessage("");
    setScoreSyncStatus("idle");
    setTopStreakThisRun(0);
  };

  if (isComplete) {
    return (
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        style={styles.screen}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Round complete</Text>
          <Text style={styles.body}>Here is how you did this round.</Text>
        </View>

        <View style={styles.summaryCard}>
          <Metric label="Score" value={score.toString()} />
          <Metric label="Correct" value={`${correctCount}/${totalRounds}`} />
          <Metric label="Accuracy" value={`${accuracy}%`} />
          <Metric label="Best streak" value={topStreakThisRun.toString()} />
        </View>

        <ScoreSyncNotice
          isSignedIn={Boolean(user)}
          message={scoreSyncMessage}
          status={scoreSyncStatus}
        />

        {errorMessage ? (
          <Text selectable style={styles.errorText}>
            {errorMessage}
          </Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          onPress={handleRestartPress}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>Play again</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <View style={styles.screenShell}>
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        style={styles.screen}
      >
        <View style={styles.scoreRow}>
          <Metric label="Score" value={score.toString()} />
          <Metric label="Streak" value={streak.toString()} />
          <Metric
            label="High score"
            value={isProgressLoading ? "..." : progress.highScore.toString()}
          />
        </View>

        <Animated.View layout={LinearTransition} style={styles.gameCard}>
          <ClipPreview item={currentItem} key={currentItem.id} />

          <View style={styles.promptGroup}>
            <Text style={styles.sectionTitle}>Clip {roundIndex + 1}</Text>
            <Text style={styles.body}>
              Watch for consistency in motion, lighting, edges, and timing.
            </Text>
          </View>

          <View style={styles.answerRow}>
            <AnswerButton
              answer="real"
              correctAnswer={currentItem.correctAnswer}
              isDisabled={hasAnswered}
              onPress={() => handleAnswerPress("real")}
              selectedAnswer={selectedAnswer}
            />
            <AnswerButton
              answer="ai"
              correctAnswer={currentItem.correctAnswer}
              isDisabled={hasAnswered}
              onPress={() => handleAnswerPress("ai")}
              selectedAnswer={selectedAnswer}
            />
          </View>

        </Animated.View>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !hasAnswered }}
          disabled={!hasAnswered}
          onPress={handleNextPress}
          style={[styles.primaryButton, !hasAnswered && styles.disabledButton]}
        >
          <Text
            style={[
              styles.primaryButtonText,
              !hasAnswered && styles.disabledButtonText,
            ]}
          >
            {roundIndex < totalRounds - 1 ? "Next clip" : "Finish round"}
          </Text>
        </Pressable>

        {errorMessage ? (
          <Text selectable style={styles.errorText}>
            {errorMessage}
          </Text>
        ) : null}

      </ScrollView>

      {selectedAnswer !== null ? (
        <AnswerReactionPopup
          correctAnswer={currentItem.correctAnswer}
          key={`solo-${currentItem.id}-${selectedAnswer}`}
          mode="solo"
          selectedAnswer={selectedAnswer}
          streak={streak}
        />
      ) : null}
    </View>
  );
}

function GameModeMenu({
  gameSamples,
  onSelectMode,
}: {
  gameSamples: ReturnType<typeof usePublicGameSamples>;
  onSelectMode: (mode: GameScreenMode) => void;
}) {
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      style={styles.screen}
    >
      <View style={styles.header}>
        <Text style={styles.body}>
          Practice deciding whether short clips are real or fake. Start with
          solo scoring or compare your judgement with VigilVid.
        </Text>
        {gameSamples.errorMessage ? (
          <Text selectable style={styles.errorText}>
            {gameSamples.errorMessage}
          </Text>
        ) : null}
      </View>

      <View style={styles.modeGrid}>
        <GameModeCard
          description="Play all clips, build a streak, and try to beat your best score."
          icon="target"
          isDisabled={gameSamples.status === "loading"}
          label={
            gameSamples.status === "loading"
              ? "Loading"
              : gameSamples.status === "remote"
                ? "Fresh clips"
              : `${gameSamples.items.length} clips`
          }
          onPress={() => onSelectMode("solo")}
          title="Solo mode"
        />
        <GameModeCard
          description="Answer each clip, watch VigilVid reveal its pick, and see who reads more clips correctly."
          icon="cpu"
          isDisabled={gameSamples.status === "loading"}
          label="You vs VigilVid"
          onPress={() => onSelectMode("machine")}
          title="You vs VigilVid"
        />
      </View>
    </ScrollView>
  );
}

function GameModeCard({
  description,
  icon,
  isDisabled = false,
  label,
  onPress,
  title,
}: {
  description: string;
  icon: FeatherIconName;
  isDisabled?: boolean;
  label: string;
  onPress?: () => void;
  title: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      disabled={isDisabled}
      onPress={onPress}
      style={[styles.modeCard, isDisabled && styles.modeCardDisabled]}
    >
      <View style={styles.modeCardHeader}>
        <View style={styles.modeIconFrame}>
          <Feather color={colors.gameAccent} name={icon} size={22} />
        </View>
        <Text style={styles.modeMetaText}>{label}</Text>
      </View>
      <View style={styles.modeTextGroup}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.body}>{description}</Text>
      </View>
    </Pressable>
  );
}

function ManVsMachineModeScreen({
  gameItems,
}: {
  gameItems: SoloGameItem[];
}) {
  const [correctCount, setCorrectCount] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [isMachineRevealComplete, setIsMachineRevealComplete] = useState(false);
  const [modelCorrectCount, setModelCorrectCount] = useState(0);
  const [modelRoundResults, setModelRoundResults] = useState<boolean[]>([]);
  const [roundIndex, setRoundIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<GameAnswer | null>(null);
  const [userRoundResults, setUserRoundResults] = useState<boolean[]>([]);

  const currentItem = gameItems[roundIndex];
  const totalRounds = gameItems.length;
  const hasAnswered = selectedAnswer !== null;
  const answeredRounds = userRoundResults.length;
  const modelIsCorrect = currentItem.modelAnswer === currentItem.correctAnswer;
  const userAccuracy = getAccuracyPercent(correctCount, totalRounds);
  const modelAccuracy = getAccuracyPercent(modelCorrectCount, totalRounds);
  const resultText = getMachineResultText(correctCount, modelCorrectCount);
  const machineRevealStatus: MachineRevealStatus =
    selectedAnswer === null
      ? "idle"
      : isMachineRevealComplete
        ? "revealed"
        : "checking";

  const handleMachineRevealComplete = useCallback(() => {
    setIsMachineRevealComplete(true);
    setModelCorrectCount((currentModelCorrectCount) =>
      modelIsCorrect ? currentModelCorrectCount + 1 : currentModelCorrectCount,
    );
    setModelRoundResults((currentResults) => [
      ...currentResults,
      modelIsCorrect,
    ]);
  }, [modelIsCorrect]);

  useEffect(() => {
    if (selectedAnswer === null || isMachineRevealComplete || isComplete) {
      return undefined;
    }

    const revealTimer = setTimeout(() => {
      handleMachineRevealComplete();
    }, 650);

    return () => clearTimeout(revealTimer);
  }, [
    handleMachineRevealComplete,
    isComplete,
    isMachineRevealComplete,
    selectedAnswer,
  ]);

  const handleAnswerPress = (answer: GameAnswer) => {
    if (hasAnswered || isComplete) {
      return;
    }

    const answerIsCorrect = answer === currentItem.correctAnswer;
    setSelectedAnswer(answer);
    setIsMachineRevealComplete(false);
    setCorrectCount((currentCorrectCount) =>
      answerIsCorrect ? currentCorrectCount + 1 : currentCorrectCount,
    );
    setUserRoundResults((currentResults) => [
      ...currentResults,
      answerIsCorrect,
    ]);

    void Haptics.notificationAsync(
      answerIsCorrect
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Warning,
    );
  };

  const handleNextPress = () => {
    if (!hasAnswered) {
      return;
    }

    if (roundIndex < totalRounds - 1) {
      setRoundIndex((currentRoundIndex) => currentRoundIndex + 1);
      setIsMachineRevealComplete(false);
      setSelectedAnswer(null);
      return;
    }

    setIsComplete(true);
  };

  const handleRestartPress = () => {
    setCorrectCount(0);
    setIsComplete(false);
    setIsMachineRevealComplete(false);
    setModelCorrectCount(0);
    setModelRoundResults([]);
    setRoundIndex(0);
    setSelectedAnswer(null);
    setUserRoundResults([]);
  };

  if (isComplete) {
    return (
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        style={styles.screen}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Comparison complete</Text>
          <Text style={styles.body}>{resultText}</Text>
        </View>

        <DuelProgressCard
          answeredRounds={answeredRounds}
          modelCorrectCount={modelCorrectCount}
          modelResults={modelRoundResults}
          totalRounds={totalRounds}
          userCorrectCount={correctCount}
          userResults={userRoundResults}
        />

        <View style={styles.summaryCard}>
          <Metric label="Your accuracy" value={`${userAccuracy}%`} />
          <Metric label="VigilVid accuracy" value={`${modelAccuracy}%`} />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>What this means</Text>
          <Text style={styles.body}>
            This compares your answers with estimates from VigilVid for the
            same clips. The track shows which rounds each side read correctly.
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={handleRestartPress}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>Play again</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <View style={styles.screenShell}>
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        style={styles.screen}
      >
        <DuelProgressCard
          answeredRounds={answeredRounds}
          machinePick={selectedAnswer === null ? null : currentItem.modelAnswer}
          machineStatus={machineRevealStatus}
          modelCorrectCount={modelCorrectCount}
          modelResults={modelRoundResults}
          totalRounds={totalRounds}
          userCorrectCount={correctCount}
          userResults={userRoundResults}
        />

        <Animated.View layout={LinearTransition} style={styles.gameCard}>
          <ClipPreview item={currentItem} key={currentItem.id} />

          <View style={styles.answerRow}>
            <AnswerButton
              answer="real"
              correctAnswer={currentItem.correctAnswer}
              isDisabled={hasAnswered}
              onPress={() => handleAnswerPress("real")}
              selectedAnswer={selectedAnswer}
            />
            <AnswerButton
              answer="ai"
              correctAnswer={currentItem.correctAnswer}
              isDisabled={hasAnswered}
              onPress={() => handleAnswerPress("ai")}
              selectedAnswer={selectedAnswer}
            />
          </View>

        </Animated.View>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{
            disabled: !hasAnswered || !isMachineRevealComplete,
          }}
          disabled={!hasAnswered || !isMachineRevealComplete}
          onPress={handleNextPress}
          style={[
            styles.primaryButton,
            (!hasAnswered || !isMachineRevealComplete) && styles.disabledButton,
          ]}
        >
          <Text
            style={[
              styles.primaryButtonText,
              (!hasAnswered || !isMachineRevealComplete) &&
                styles.disabledButtonText,
            ]}
          >
            {hasAnswered && !isMachineRevealComplete
              ? "VigilVid is checking"
              : roundIndex < totalRounds - 1
                ? "Next comparison"
                : "Finish comparison"}
          </Text>
        </Pressable>
      </ScrollView>

      {selectedAnswer !== null ? (
        <AnswerReactionPopup
          correctAnswer={currentItem.correctAnswer}
          key={`machine-${currentItem.id}-${selectedAnswer}`}
          mode="machine"
          selectedAnswer={selectedAnswer}
        />
      ) : null}
    </View>
  );
}

function ScoreSyncNotice({
  isSignedIn,
  message,
  status,
}: {
  isSignedIn: boolean;
  message: string;
  status: ScoreSyncStatus;
}) {
  const details = getScoreSyncDetails(status, isSignedIn, message);

  return (
    <View style={[styles.syncCard, { borderColor: details.color }]}>
      <View style={[styles.syncIconFrame, { backgroundColor: `${details.color}12` }]}>
        <Feather color={details.color} name={details.icon} size={20} />
      </View>
      <View style={styles.syncTextGroup}>
        <Text style={styles.syncTitle}>{details.title}</Text>
        <Text style={styles.syncText}>{details.body}</Text>
      </View>
    </View>
  );
}

function getScoreSyncDetails(
  status: ScoreSyncStatus,
  isSignedIn: boolean,
  message: string,
): {
  body: string;
  color: string;
  icon: FeatherIconName;
  title: string;
} {
  if (status === "syncing") {
    return {
      body: message || "Saving score to your account.",
      color: colors.analysisBlue,
      icon: "refresh-cw",
      title: "Saving score",
    };
  }

  if (status === "synced") {
    return {
      body: message || "Score saved to your account.",
      color: colors.likelyReal,
      icon: "cloud",
      title: "Account score saved",
    };
  }

  if (status === "failed") {
    return {
      body: message || "Could not save to your account. Your score is still saved on this phone.",
      color: colors.uncertain,
      icon: "alert-circle",
      title: "Score saved on this phone",
    };
  }

  if (status === "skipped" || !isSignedIn) {
    return {
      body:
        message ||
        "Sign in to save future game scores to your account.",
      color: colors.textSecondary,
      icon: "smartphone",
      title: "Score ready",
    };
  }

  return {
    body: message || "Preparing to save score.",
    color: colors.analysisBlue,
    icon: "clock",
    title: "Score ready",
  };
}

function ClipPreview({ item }: { item: SoloGameItem }) {
  useEffect(() => {
    if (__DEV__) {
      console.info(`[VigilVid game clip] ${item.title}: ${item.id}`);
    }
  }, [item.id, item.title]);

  const player = useVideoPlayer(item.videoSource, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.muted = false;
    videoPlayer.play();
  });
  const { error, status } = useEvent(player, "statusChange", {
    error: undefined,
    status: player.status,
  });

  return (
    <View style={styles.previewFrame}>
      <VideoView
        contentFit="contain"
        nativeControls
        player={player}
        style={styles.previewVideo}
        useExoShutter={false}
      />
      {status === "loading" ? (
        <View style={styles.previewStatusOverlay}>
          <Text style={styles.previewStatusText}>Preparing clip...</Text>
        </View>
      ) : null}
      {status === "error" ? (
        <View style={styles.previewStatusOverlay}>
          <Feather color={colors.surface} name="alert-circle" size={18} />
          <Text selectable style={styles.previewStatusText}>
            {error?.message || "Video could not load. Try another round."}
          </Text>
        </View>
      ) : null}
      <View style={styles.previewTopBar}>
        <Text style={styles.previewLabel}>Game clip</Text>
        <Text style={styles.previewTime}>{item.durationSec}s</Text>
      </View>
    </View>
  );
}

function DuelProgressCard({
  answeredRounds,
  machinePick = null,
  machineStatus = "idle",
  modelCorrectCount,
  modelResults,
  totalRounds,
  userCorrectCount,
  userResults,
}: {
  answeredRounds: number;
  machinePick?: GameAnswer | null;
  machineStatus?: MachineRevealStatus;
  modelCorrectCount: number;
  modelResults: boolean[];
  totalRounds: number;
  userCorrectCount: number;
  userResults: boolean[];
}) {
  return (
    <View style={styles.duelCard}>
      <View style={styles.duelHeader}>
        <View style={styles.duelHeaderText}>
          <Text style={styles.duelTitle}>Duel progress</Text>
          <Text style={styles.duelSubtitle}>
            Answered {answeredRounds} of {totalRounds}
          </Text>
        </View>
        <DuelStatusPill
          answeredRounds={answeredRounds}
          machinePick={machinePick}
          machineStatus={machineStatus}
          totalRounds={totalRounds}
        />
      </View>

      <View style={styles.duelRows}>
        <DuelProgressRow
          answeredRounds={answeredRounds}
          color={colors.primaryTeal}
          correctCount={userCorrectCount}
          label="You"
          latestIndex={answeredRounds - 1}
          results={userResults}
          totalRounds={totalRounds}
        />
        <DuelProgressRow
          answeredRounds={answeredRounds}
          color={colors.gameAccent}
          correctCount={modelCorrectCount}
          label="VigilVid"
          latestIndex={answeredRounds - 1}
          results={modelResults}
          totalRounds={totalRounds}
        />
      </View>
    </View>
  );
}

function DuelStatusPill({
  answeredRounds,
  machinePick,
  machineStatus,
  totalRounds,
}: {
  answeredRounds: number;
  machinePick: GameAnswer | null;
  machineStatus: MachineRevealStatus;
  totalRounds: number;
}) {
  if (machineStatus === "checking") {
    return (
      <Animated.View
        accessibilityLabel="VigilVid is checking this clip."
        accessibilityLiveRegion="polite"
        accessible
        entering={FadeIn.duration(120)}
        style={[styles.duelRoundPill, styles.duelStatusPill]}
      >
        <SignalPulseDots />
        <Text numberOfLines={1} style={styles.duelRoundText}>
          Checking
        </Text>
      </Animated.View>
    );
  }

  if (machineStatus === "revealed" && machinePick !== null) {
    const pickColor =
      machinePick === "real" ? colors.likelyReal : colors.likelyAi;

    return (
      <Animated.View
        accessibilityLabel={`VigilVid picked ${getAnswerLabel(machinePick)}.`}
        accessibilityLiveRegion="polite"
        accessible
        entering={FadeIn.duration(120)}
        key={`machine-picked-${machinePick}`}
        style={[
          styles.duelRoundPill,
          styles.duelStatusPill,
          {
            backgroundColor: `${pickColor}12`,
            borderColor: `${pickColor}66`,
          },
        ]}
      >
        <Feather color={pickColor} name="cpu" size={15} />
        <Text
          numberOfLines={1}
          style={[styles.duelRoundText, { color: pickColor }]}
        >
          VigilVid: {getAnswerLabel(machinePick)}
        </Text>
      </Animated.View>
    );
  }

  return (
    <View
      accessibilityLabel={`${answeredRounds} of ${totalRounds} rounds answered.`}
      accessible
      style={styles.duelRoundPill}
    >
      <Feather color={colors.gameAccent} name="zap" size={15} />
      <Text numberOfLines={1} style={styles.duelRoundText}>
        {answeredRounds}/{totalRounds}
      </Text>
    </View>
  );
}

function DuelProgressRow({
  answeredRounds,
  color,
  correctCount,
  label,
  latestIndex,
  results,
  totalRounds,
}: {
  answeredRounds: number;
  color: string;
  correctCount: number;
  label: string;
  latestIndex: number;
  results: boolean[];
  totalRounds: number;
}) {
  return (
    <View style={styles.duelRow}>
      <View style={styles.duelRowHeader}>
        <Text style={styles.duelRowLabel}>{label}</Text>
        <Text style={[styles.duelScoreText, { color }]}>
          {correctCount}/{answeredRounds}
        </Text>
      </View>
      <View
        accessibilityLabel={`${label} got ${correctCount} out of ${answeredRounds} answered rounds correct.`}
        accessible
        style={styles.duelDots}
      >
        {Array.from({ length: totalRounds }).map((_, index) => (
          <DuelProgressDot
            color={color}
            key={`${label}-${index}`}
            status={getDuelDotStatus(results[index])}
            shouldPulse={index === latestIndex}
          />
        ))}
      </View>
    </View>
  );
}

function DuelProgressDot({
  color,
  shouldPulse,
  status,
}: {
  color: string;
  shouldPulse: boolean;
  status: "correct" | "missed" | "pending";
}) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);

  useEffect(() => {
    if (!shouldPulse || status === "pending" || reduceMotion) {
      scale.value = 1;
      return;
    }

    scale.value = withSequence(
      withTiming(1.28, {
        duration: 140,
        easing: Easing.out(Easing.cubic),
      }),
      withTiming(1, {
        duration: 150,
        easing: Easing.out(Easing.cubic),
      }),
    );
  }, [reduceMotion, scale, shouldPulse, status]);

  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const backgroundColor =
    status === "correct"
      ? color
      : status === "missed"
        ? colors.surface
        : colors.surfaceMuted;
  const borderColor =
    status === "correct"
      ? color
      : status === "missed"
        ? colors.uncertain
        : colors.border;

  return (
    <Animated.View
      style={[
        styles.duelDot,
        dotStyle,
        {
          backgroundColor,
          borderColor,
        },
      ]}
    >
      {status === "missed" ? <View style={styles.duelDotMiss} /> : null}
    </Animated.View>
  );
}

function SignalPulseDots() {
  return (
    <View style={styles.signalPulseGroup}>
      {[0, 120, 240].map((delay) => (
        <SignalPulseDot delayMs={delay} key={delay} />
      ))}
    </View>
  );
}

function SignalPulseDot({ delayMs }: { delayMs: number }) {
  const opacity = useSharedValue(0.28);
  const scale = useSharedValue(0.82);

  useEffect(() => {
    const startTimer = setTimeout(() => {
      opacity.value = withRepeat(
        withSequence(
          withTiming(1, {
            duration: 280,
            easing: Easing.out(Easing.cubic),
          }),
          withTiming(0.28, {
            duration: 380,
            easing: Easing.in(Easing.cubic),
          }),
        ),
        -1,
        false,
      );
      scale.value = withRepeat(
        withSequence(
          withTiming(1, {
            duration: 280,
            easing: Easing.out(Easing.cubic),
          }),
          withTiming(0.82, {
            duration: 380,
            easing: Easing.in(Easing.cubic),
          }),
        ),
        -1,
        false,
      );
    }, delayMs);

    return () => {
      clearTimeout(startTimer);
      cancelAnimation(opacity);
      cancelAnimation(scale);
    };
  }, [delayMs, opacity, scale]);

  const dotStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.signalPulseDot, dotStyle]} />
  );
}

function AnswerButton({
  answer,
  correctAnswer,
  isDisabled,
  onPress,
  selectedAnswer,
}: {
  answer: GameAnswer;
  correctAnswer: GameAnswer;
  isDisabled: boolean;
  onPress: () => void;
  selectedAnswer: GameAnswer | null;
}) {
  const isRealAnswer = answer === "real";
  const label = isRealAnswer ? "Real" : "Fake";
  const isSelected = selectedAnswer === answer;
  const hasAnswered = selectedAnswer !== null;
  const isCorrectSelection = isSelected && answer === correctAnswer;
  const outcomeColor = isCorrectSelection ? colors.likelyReal : colors.likelyAi;
  const pressScale = useSharedValue(1);
  const selectionProgress = useSharedValue(0);
  const mutedProgress = useSharedValue(0);

  useEffect(() => {
    selectionProgress.value = withTiming(isSelected ? 1 : 0, {
      duration: 160,
      easing: Easing.out(Easing.cubic),
    });
    mutedProgress.value = withTiming(hasAnswered && !isSelected ? 1 : 0, {
      duration: 160,
      easing: Easing.out(Easing.cubic),
    });
  }, [hasAnswered, isSelected, mutedProgress, selectionProgress]);

  const animatedButtonStyle = useAnimatedStyle(() => ({
    opacity: 1 - mutedProgress.value * 0.34,
    transform: [
      {
        scale:
          pressScale.value +
          selectionProgress.value * 0.018 -
          mutedProgress.value * 0.018,
      },
    ],
  }));

  const handlePressIn = () => {
    if (isDisabled) {
      return;
    }

    pressScale.value = withTiming(0.97, {
      duration: 90,
      easing: Easing.out(Easing.cubic),
    });
  };

  const handlePressOut = () => {
    pressScale.value = withTiming(1, {
      duration: 130,
      easing: Easing.out(Easing.cubic),
    });
  };

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, selected: isSelected }}
      disabled={isDisabled}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.answerButton,
        animatedButtonStyle,
        isSelected && {
          backgroundColor: `${outcomeColor}12`,
          borderColor: outcomeColor,
        },
        hasAnswered && !isSelected && styles.answerButtonMuted,
      ]}
    >
      <Text
        style={[
          styles.answerButtonText,
          isSelected && { color: outcomeColor },
          hasAnswered && !isSelected && styles.answerButtonTextMuted,
        ]}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

function AnswerReactionPopup({
  correctAnswer,
  mode,
  selectedAnswer,
  streak = 0,
}: {
  correctAnswer: GameAnswer;
  mode: "machine" | "solo";
  selectedAnswer: GameAnswer;
  streak?: number;
}) {
  const reduceMotion = useReducedMotion();
  const [shouldRender, setShouldRender] = useState(true);
  const isCorrect = selectedAnswer === correctAnswer;
  const color = isCorrect ? colors.likelyReal : colors.uncertain;
  const icon = isCorrect ? "award" : "search";
  const title = isCorrect ? "Good job!" : "Good try";
  const body = getAnswerReactionBody({
    isCorrect,
    mode,
    streak,
  });
  const opacity = useSharedValue(reduceMotion ? 1 : 0);
  const scale = useSharedValue(reduceMotion ? 1 : 0.94);
  const translateY = useSharedValue(reduceMotion ? 0 : 18);

  useEffect(() => {
    setShouldRender(true);

    if (reduceMotion) {
      opacity.value = 1;
      scale.value = 1;
      translateY.value = 0;
    } else {
      opacity.value = 0;
      scale.value = 0.94;
      translateY.value = 18;

      opacity.value = withTiming(1, {
        duration: 120,
        easing: Easing.out(Easing.cubic),
      });
      translateY.value = withTiming(0, {
        duration: 220,
        easing: Easing.out(Easing.cubic),
      });
      scale.value = withSequence(
        withTiming(1.035, {
          duration: 160,
          easing: Easing.out(Easing.cubic),
        }),
        withTiming(1, {
          duration: 120,
          easing: Easing.out(Easing.cubic),
        }),
      );
    }

    const popupHoldMs = 1400;
    const popupRemoveMs = reduceMotion ? popupHoldMs + 20 : popupHoldMs + 180;

    const exitTimer = setTimeout(() => {
      opacity.value = withTiming(0, {
        duration: reduceMotion ? 1 : 160,
        easing: Easing.in(Easing.cubic),
      });
      translateY.value = withTiming(reduceMotion ? 0 : -14, {
        duration: reduceMotion ? 1 : 160,
        easing: Easing.in(Easing.cubic),
      });
      scale.value = withTiming(reduceMotion ? 1 : 0.98, {
        duration: reduceMotion ? 1 : 160,
        easing: Easing.in(Easing.cubic),
      });
    }, popupHoldMs);
    const removeTimer = setTimeout(() => {
      setShouldRender(false);
    }, popupRemoveMs);

    return () => {
      clearTimeout(exitTimer);
      clearTimeout(removeTimer);
    };
  }, [opacity, reduceMotion, scale, translateY]);

  const popupStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  if (!shouldRender) {
    return null;
  }

  return (
    <View pointerEvents="none" style={styles.reactionOverlay}>
      <Animated.View
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        accessible
        style={[styles.reactionPopup, popupStyle, { borderColor: color }]}
      >
        <View
          style={[
            styles.reactionIconFrame,
            { backgroundColor: `${color}16` },
          ]}
        >
          <Feather color={color} name={icon} size={24} />
        </View>
        <View style={styles.reactionTextGroup}>
          <Text style={[styles.reactionTitle, { color }]}>{title}</Text>
          <Text style={styles.reactionBody}>{body}</Text>
        </View>
      </Animated.View>
    </View>
  );
}

function getAnswerReactionBody({
  isCorrect,
  mode,
  streak,
}: {
  isCorrect: boolean;
  mode: "machine" | "solo";
  streak: number;
}) {
  if (isCorrect) {
    if (mode === "solo" && streak > 1) {
      return `${streak} correct in a row. Keep going.`;
    }

    return mode === "solo" ? "Keep it up." : "Watch the race update.";
  }

  return mode === "solo" ? "Keep going." : "Watch the duel update.";
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function getDuelDotStatus(result: boolean | undefined) {
  if (result === undefined) {
    return "pending";
  }

  return result ? "correct" : "missed";
}

function getAnswerLabel(answer: GameAnswer | null) {
  if (answer === "real") {
    return "Real";
  }

  if (answer === "ai") {
    return "Fake";
  }

  return "Not answered";
}

function getMachineResultText(userCorrect: number, modelCorrect: number) {
  if (userCorrect > modelCorrect) {
    return "You beat VigilVid on this sample set.";
  }

  if (modelCorrect > userCorrect) {
    return "VigilVid beat your score on this sample set.";
  }

  return "You tied with VigilVid on this sample set.";
}

function getAccuracyPercent(correct: number, total: number) {
  if (total <= 0) {
    return 0;
  }

  return Math.round((correct / total) * 100);
}

const styles = StyleSheet.create({
  screenShell: {
    backgroundColor: colors.background,
    flex: 1,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    gap: spacing.lg,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  header: {
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  headerBackButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: spacing.sm,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: "700",
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
  },
  body: {
    color: colors.textSecondary,
    fontSize: 16,
    lineHeight: 24,
  },
  modeGrid: {
    gap: spacing.md,
  },
  modeCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.lg,
    minHeight: 156,
    padding: spacing.lg,
  },
  modeCardDisabled: {
    opacity: 0.58,
  },
  modeCardHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  modeIconFrame: {
    alignItems: "center",
    backgroundColor: colors.gameAccentMuted,
    borderRadius: radius.md,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  modeMetaText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  modeTextGroup: {
    gap: spacing.sm,
  },
  scoreRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  duelCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  duelHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  duelHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  duelTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "800",
  },
  duelSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
  },
  duelRoundPill: {
    alignItems: "center",
    backgroundColor: colors.gameAccentMuted,
    borderRadius: radius.sm,
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  duelStatusPill: {
    borderColor: `${colors.gameAccent}24`,
    borderWidth: 1,
    maxWidth: 152,
  },
  duelRoundText: {
    color: colors.gameAccent,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
    fontWeight: "800",
  },
  duelRows: {
    gap: spacing.md,
  },
  duelRow: {
    gap: spacing.sm,
  },
  duelRowHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  duelRowLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "800",
  },
  duelScoreText: {
    fontSize: 13,
    fontVariant: ["tabular-nums"],
    fontWeight: "800",
  },
  duelDots: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  duelDot: {
    alignItems: "center",
    borderRadius: 7,
    borderWidth: 1,
    height: 14,
    justifyContent: "center",
    width: 14,
  },
  duelDotMiss: {
    backgroundColor: colors.uncertain,
    borderRadius: 2,
    height: 2,
    width: 7,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.lg,
  },
  syncCard: {
    alignItems: "flex-start",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.lg,
  },
  syncIconFrame: {
    alignItems: "center",
    borderRadius: radius.md,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  syncTextGroup: {
    flex: 1,
    gap: spacing.xs,
  },
  syncTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "800",
  },
  syncText: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  gameCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.lg,
  },
  previewFrame: {
    aspectRatio: 16 / 10,
    backgroundColor: colors.textPrimary,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  previewVideo: {
    height: "100%",
    width: "100%",
  },
  previewStatusOverlay: {
    alignItems: "center",
    backgroundColor: "rgba(17, 24, 39, 0.72)",
    gap: spacing.sm,
    inset: 0,
    justifyContent: "center",
    padding: spacing.lg,
    position: "absolute",
  },
  previewStatusText: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
    textAlign: "center",
  },
  previewTopBar: {
    alignItems: "center",
    backgroundColor: "rgba(17, 24, 39, 0.78)",
    flexDirection: "row",
    justifyContent: "space-between",
    left: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    position: "absolute",
    right: 0,
    top: 0,
  },
  previewLabel: {
    color: colors.surface,
    fontSize: 13,
    fontWeight: "700",
  },
  previewTime: {
    color: colors.surface,
    fontSize: 13,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
  },
  promptGroup: {
    gap: spacing.sm,
  },
  answerRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  answerButton: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: spacing.md,
  },
  answerButtonText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
  },
  answerButtonMuted: {
    backgroundColor: colors.surfaceMuted,
    opacity: 0.7,
  },
  answerButtonTextMuted: {
    color: colors.textSecondary,
  },
  reactionOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  reactionPopup: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    elevation: 6,
    gap: spacing.md,
    maxWidth: 320,
    padding: spacing.xl,
    shadowColor: colors.textPrimary,
    shadowOffset: { height: 6, width: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    width: "100%",
  },
  reactionIconFrame: {
    alignItems: "center",
    borderRadius: 24,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  reactionTextGroup: {
    alignItems: "center",
    gap: spacing.xs,
  },
  reactionTitle: {
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
  },
  reactionBody: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 21,
    textAlign: "center",
  },
  signalPulseGroup: {
    alignItems: "center",
    flexDirection: "row",
    gap: 3,
  },
  signalPulseDot: {
    backgroundColor: colors.gameAccent,
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  metric: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    gap: spacing.xs,
    minWidth: 92,
    padding: spacing.md,
  },
  metricValue: {
    color: colors.textPrimary,
    fontSize: 18,
    fontVariant: ["tabular-nums"],
    fontWeight: "800",
  },
  metricLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.primaryTeal,
    borderRadius: radius.md,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: spacing.lg,
  },
  primaryButtonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: "700",
  },
  disabledButton: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderWidth: 1,
  },
  disabledButtonText: {
    color: colors.textSecondary,
  },
  errorText: {
    color: colors.likelyAi,
    fontSize: 14,
    lineHeight: 20,
  },
});
