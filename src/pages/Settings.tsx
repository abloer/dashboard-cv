import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Save, Bell, Monitor, Database, Shield, Palette } from "lucide-react";

const Settings = () => {
  const { toast } = useToast();

  const handleSave = () => {
    toast({
      title: "Settings saved",
      description: "Your preferences have been updated successfully.",
    });
  };

  return (
    <DashboardLayout>
      <Header 
        title="Settings" 
        subtitle="System configuration & preferences"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Display Settings */}
        <Card className="p-6 bg-card border-border animate-fade-in">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <Monitor className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Display Settings</h3>
              <p className="text-sm text-muted-foreground">Configure display preferences</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Enable Animations</p>
                <p className="text-xs text-muted-foreground">Smooth transitions & effects</p>
              </div>
              <Switch defaultChecked />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Compact Mode</p>
                <p className="text-xs text-muted-foreground">Reduce spacing for more content</p>
              </div>
              <Switch />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Show Tooltips</p>
                <p className="text-xs text-muted-foreground">Display helpful hints on hover</p>
              </div>
              <Switch defaultChecked />
            </div>
          </div>
        </Card>

        {/* Notifications */}
        <Card className="p-6 bg-card border-border animate-fade-in">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
              <Bell className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Notifications</h3>
              <p className="text-sm text-muted-foreground">Alert & notification preferences</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Push Notifications</p>
                <p className="text-xs text-muted-foreground">Real-time alerts</p>
              </div>
              <Switch defaultChecked />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Email Reports</p>
                <p className="text-xs text-muted-foreground">Daily summary via email</p>
              </div>
              <Switch />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Critical Alerts</p>
                <p className="text-xs text-muted-foreground">Maintenance & error alerts</p>
              </div>
              <Switch defaultChecked />
            </div>
          </div>
        </Card>

        {/* Data Settings */}
        <Card className="p-6 bg-card border-border animate-fade-in">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-warning/20 flex items-center justify-center">
              <Database className="w-5 h-5 text-warning" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Data Settings</h3>
              <p className="text-sm text-muted-foreground">Data refresh & storage settings</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                Refresh Interval (seconds)
              </label>
              <Input 
                type="number" 
                defaultValue="30" 
                className="bg-secondary border-border"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                Data Retention Period
              </label>
              <Select defaultValue="30">
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 Days</SelectItem>
                  <SelectItem value="30">30 Days</SelectItem>
                  <SelectItem value="90">90 Days</SelectItem>
                  <SelectItem value="365">1 Year</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Auto-sync</p>
                <p className="text-xs text-muted-foreground">Automatically sync data</p>
              </div>
              <Switch defaultChecked />
            </div>
          </div>
        </Card>

        {/* System Info */}
        <Card className="p-6 bg-card border-border animate-fade-in">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-success" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">System Info</h3>
              <p className="text-sm text-muted-foreground">Dashboard information</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="p-4 bg-secondary/50 rounded-lg border border-border">
              <p className="text-sm font-medium text-foreground mb-2">Public Monitoring Dashboard</p>
              <p className="text-xs text-muted-foreground">
                This is a public read-only dashboard for monitoring fleet operations and productivity metrics. 
                Data is updated in real-time from connected sensors and equipment.
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Real-time Updates</p>
                <p className="text-xs text-muted-foreground">Live data synchronization enabled</p>
              </div>
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Data Access</p>
                <p className="text-xs text-muted-foreground">Read-only access mode</p>
              </div>
              <span className="text-xs bg-primary/20 text-primary px-2 py-1 rounded">View Only</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Save Button */}
      <div className="mt-6 flex justify-end">
        <Button 
          onClick={handleSave}
          className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
        >
          <Save className="w-4 h-4" />
          Save Settings
        </Button>
      </div>
    </DashboardLayout>
  );
};

export default Settings;
