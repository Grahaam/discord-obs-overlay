import { UIConfig, BotStatus, AlertPayload, MediaType } from "../../types";
import { locales } from "../../locales";

export interface TabProps {
  config?: UIConfig;
  setConfig?: React.Dispatch<React.SetStateAction<UIConfig>>;
  botStatus?: BotStatus;
  t?: typeof locales["fr"];
  handleManualBotReconnect?: () => Promise<void>;
  bannedWordInput?: string;
  setBannedWordInput?: React.Dispatch<React.SetStateAction<string>>;
  handleAddBannedWord?: () => void;
  handleRemoveBannedWord?: (word: string) => void;
  handleTriggerTest?: (payload?: Partial<AlertPayload>) => Promise<void>;
  simName?: string;
  setSimName?: React.Dispatch<React.SetStateAction<string>>;
  simType?: MediaType;
  setSimType?: React.Dispatch<React.SetStateAction<MediaType>>;
  simText?: string;
  setSimText?: React.Dispatch<React.SetStateAction<string>>;
  simMediaUrl?: string;
  setSimMediaUrl?: React.Dispatch<React.SetStateAction<string>>;
  saveLoading?: boolean;
  handleSaveSettings?: (overrideConfig?: UIConfig) => Promise<void>;
  roleIdInput?: string;
  setRoleIdInput?: React.Dispatch<React.SetStateAction<string>>;
  handleAddRoleId?: () => void;
  handleRemoveRoleId?: (id: string) => void;
}
